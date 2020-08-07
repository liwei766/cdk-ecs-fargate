import * as cdk from '@aws-cdk/core';
import * as route53_target from '@aws-cdk/aws-route53-targets'
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as route53 from '@aws-cdk/aws-route53'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'
import * as iam from '@aws-cdk/aws-iam'
import * as ecr from '@aws-cdk/aws-ecr'

export class DevStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- vpc with custom option ---
    // const vpc = new ec2.Vpc(this,'vpc',{
    //   maxAzs:2,
    //   cidr:'10.0.0.0/16',
    //   subnetConfiguration: [
    //       {
    //         cidrMask: 24,
    //         name: 'ingress',
    //         subnetType: ec2.SubnetType.PUBLIC,
    //       },
    //       {
    //         cidrMask: 24,
    //         name: 'application',
    //         subnetType: ec2.SubnetType.PRIVATE,
    //       },
    //       {
    //         cidrMask: 28,
    //         name: 'rds',
    //         subnetType: ec2.SubnetType.ISOLATED,
    //       }
    //     ]
    // });
    
    
    // ---Bastion Hosts:----
    // const bastionInst = new ec2.BastionHostLinux(this, 'bastion',{
    //   vpc,
    //   subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
    // });
    
    // bastionInst.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.icmpPing(), 'Allow ping from vpc inst');
    // bastionInst.allowSshAccessFrom(ec2.Peer.ipv4('54.250.112.120/32'));
  
    // new cdk.CfnOutput(this,'Region',{value: this.region});
    // new cdk.CfnOutput(this,'BastionIp',{value: bastionInst.instancePublicIp});
    // new cdk.CfnOutput(this,'BastionIp',{value: bastionInst.instancePrivateIp});
    
    
    
    const DOMAIN_NAME = 'ekstest.xyz';
    const RECORD_NAME = 'code';
    
    const hostzone = route53.HostedZone.fromLookup(this, 'MyZone', {
      domainName: DOMAIN_NAME
    });
    
    //const vpc = ec2.Vpc.fromLookup(this,'Vpc', {isDefault:true});
    const vpc = new ec2.Vpc(this,'vpc',{maxAzs:2});
    
    const cert = new acm.Certificate(this, 'cert', {
      domainName: 'ekstest.xyz',
      subjectAlternativeNames: ['*.ekstest.xyz'],
      validationMethod: acm.ValidationMethod.DNS,
    });
    
    const tg = new elbv2.ApplicationTargetGroup(this,'TG', {vpc,port:80});
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {vpc,internetFacing:true});
    alb.addListener('Listener443',{
      certificateArns: [cert.certificateArn],
      protocol: elbv2.ApplicationProtocol.HTTPS,
      defaultTargetGroups:[tg],
      port: 443,
      open:false
    });
    alb.addListener('Listener80',{
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups:[tg],
      port: 80 ,
      open:false
    }).addRedirectResponse("app-lb-redirect-https", {
      statusCode: 'HTTP_301',
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port:'443',
    });
    
    //const homeIP = this.node.tryGetContext('HOME_IP');
    const allowIP = '54.250.112.120';
    alb.connections.allowFrom(ec2.Peer.ipv4(`${allowIP}/32`),ec2.Port.tcp(443));
    alb.connections.allowFrom(ec2.Peer.ipv4(`${allowIP}/32`),ec2.Port.tcp(80));
    
    const cluster = new ecs.Cluster(this,'Cluster', {vpc,clusterName:'dev'});
    const executionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      roleName: 'ecs-task-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ],
    });
    const serviceTaskRole = new iam.Role(this, 'EcsServiceTaskRole', {
      roleName: 'ecs-service-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })
    const taskDefinition = new ecs.TaskDefinition(this, 'Task', {
      compatibility: ecs.Compatibility.FARGATE,
      executionRole: executionRole,
      taskRole: serviceTaskRole,
      cpu: '512',
      memoryMiB:'1024'
    });
    
    // const repository = ecr.Repository.fromRepositoryName(
    //   this,
    //   'go-kubernetes-id',
    //   'go-kubernetes'
    // )
    
    taskDefinition.addContainer('theia',{
      image: ecs.ContainerImage.fromRegistry("theiaide/theia:next"),
      //image: ecs.ContainerImage.fromEcrRepository(repository)
    }).addPortMappings({
        containerPort: 3000
    });
      
    const svc = new ecs.FargateService(this,'SVC',{
      cluster,
      desiredCount:1,
      taskDefinition
    });
    
    tg.addTarget(svc);
    
   
    new route53.RecordSet(this, 'RecordSetA', {
      zone: hostzone,
      recordType: route53.RecordType.A,
      recordName: RECORD_NAME,  // 'www','2048' etc. 
      target: route53.RecordTarget.fromAlias(new route53_target.LoadBalancerTarget(alb))
    })
    
    new cdk.CfnOutput(this,'DNS name',{
      //value:`https://${listener.loadBalancer.loadBalancerDnsName}`  
      value:`https://${alb.loadBalancerDnsName}`
    });
    
    new cdk.CfnOutput(this,'URL',{
      value:`https://${RECORD_NAME}.${DOMAIN_NAME}`
    });
    
  }
}
