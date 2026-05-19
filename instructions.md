# AWS EKS Rerun Steps

Cluster deletion completed successfully. Recreate the cluster anytime.

When the cluster gets recreated, the EBS CSI driver setup must run again unless that setup gets baked into `eks-cluster.yaml`. Deleting the EKS cluster also deletes the EBS CSI add-on, OIDC provider, IAM role, node group, and cluster resources.

Use this workflow from the project root.

## Prerequisites

- AWS CLI configured with permissions to create EKS resources.
- eksctl installed.
- kubectl installed.
- Helm installed.
- Docker installed.
- Docker Hub image pushed and available to the cluster.

## 1. Create the EKS cluster

```powershell
cd D:\Projects\DevOps-Internship-Task

eksctl create cluster -f eks-cluster.yaml
```

Wait until cluster creation finishes.

Verify:

```powershell
kubectl get nodes
kubectl get pods -A
kubectl top nodes
```

## 2. Install NGINX Ingress Controller

```powershell
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```

```powershell
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
  --namespace ingress-nginx `
  --create-namespace `
  --set controller.service.type=LoadBalancer
```

Verify:

```powershell
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

Wait until `ingress-nginx-controller` receives an external AWS DNS name.

## 3. Install AWS EBS CSI Driver

MongoDB PersistentVolumeClaims on EKS require the EBS CSI driver.

```powershell
eksctl utils associate-iam-oidc-provider `
  --cluster posts-api-cluster `
  --region eu-north-1 `
  --approve
```

```powershell
eksctl create iamserviceaccount `
  --name ebs-csi-controller-sa `
  --namespace kube-system `
  --cluster posts-api-cluster `
  --region eu-north-1 `
  --role-name AmazonEKS_EBS_CSI_DriverRole `
  --role-only `
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy `
  --approve
```

```powershell
$EBS_ROLE_ARN = aws iam get-role `
  --role-name AmazonEKS_EBS_CSI_DriverRole `
  --query "Role.Arn" `
  --output text
```

```powershell
eksctl create addon `
  --name aws-ebs-csi-driver `
  --cluster posts-api-cluster `
  --region eu-north-1 `
  --service-account-role-arn $EBS_ROLE_ARN `
  --force
```

Verify:

```powershell
kubectl get pods -n kube-system | findstr ebs
kubectl get storageclass
```

Expected result: EBS CSI pods show as running.

## 4. Deploy the application foundation

```powershell
kubectl apply -f k8s/eks/namespace.yml
kubectl apply -f k8s/eks/configmap.yaml
kubectl apply -f k8s/eks/secret.yaml
kubectl apply -f k8s/eks/service.yaml
kubectl apply -f k8s/eks/statefulset.yaml
```

Watch MongoDB:

```powershell
kubectl get pods -n posts-app -w
```

Expected result:

```text
mongo-0   1/1 Running
mongo-1   1/1 Running
mongo-2   1/1 Running
```

Check PVCs:

```powershell
kubectl get pvc -n posts-app
```

Expected result:

```text
mongo-data-mongo-0   Bound   ...   gp2
mongo-data-mongo-1   Bound   ...   gp2
mongo-data-mongo-2   Bound   ...   gp2
```

## 5. Initialize MongoDB Replica Set

```powershell
kubectl apply -f k8s/eks/replicaset.yaml
```

Check job logs:

```powershell
kubectl logs job/mongo-init-replica-set -n posts-app
```

Verify replica set:

```powershell
kubectl exec -it mongo-0 -n posts-app -- mongosh --eval "rs.status()"
```

Expected result:

```text
1 PRIMARY
2 SECONDARY
```

## 6. Deploy backend, HPA, and Ingress

```powershell
kubectl apply -f k8s/eks/deployment.yaml
kubectl apply -f k8s/eks/hpa.yaml
kubectl apply -f k8s/eks/ingress.yaml
```

Check:

```powershell
kubectl get all -n posts-app
kubectl get hpa -n posts-app
kubectl get ingress -n posts-app
```

## 7. Test API through Ingress

Get the LoadBalancer DNS:

```powershell
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

Set it:

```powershell
$LB="YOUR_LOAD_BALANCER_DNS_HERE"
```

Test health:

```powershell
curl http://$LB/health
```

Test posts:

```powershell
curl http://$LB/api/posts
```

Create a post:

```powershell
Invoke-RestMethod `
  -Uri "http://$LB/api/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"EKS Ingress Test","content":"Created through AWS EKS Ingress","author":"Qasem"}'
```

Confirm:

```powershell
curl http://$LB/api/posts
```

## 8. Test HPA autoscaling

Start load generator:

```powershell
kubectl run load-generator -n posts-app --image=busybox:1.36 --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://posts-backend-service/cpu; done"
```

Watch HPA:

```powershell
kubectl get hpa -n posts-app -w
```

In another terminal:

```powershell
kubectl get pods -n posts-app -w
```

Expected result:

```text
Backend replicas scale from 1 to 5
```

Stop load generator:

```powershell
kubectl delete pod load-generator -n posts-app
```

After the load generator is deleted, HPA may take a few minutes to scale the backend down. This delay is normal because Kubernetes avoids rapid scaling changes.

## 9. Test failover

Delete backend pod:

```powershell
kubectl delete pod -n posts-app -l app=posts-backend
```

Check API health and posts:

```powershell
curl http://$LB/health
curl http://$LB/api/posts
```

Delete MongoDB pod:

```powershell
kubectl delete pod mongo-0 -n posts-app
```

Wait until it returns:

```powershell
kubectl get pods -n posts-app -w
```

Confirm data still exists:

```powershell
curl http://$LB/api/posts
```

## 10. Cleanup to avoid AWS charges

Deleting the EKS cluster removes the running Kubernetes resources and persistent volumes. MongoDB data persistence is demonstrated during pod deletion while the cluster is still running, not after deleting the full cluster.

```powershell
kubectl delete namespace posts-app
kubectl delete namespace ingress-nginx
```

Then delete the cluster:

```powershell
eksctl delete cluster --name posts-api-cluster --region eu-north-1
```

After deletion, check the AWS Console for leftovers:

```text
EKS clusters
EC2 Load Balancers
EC2 Volumes
CloudFormation stacks
```

## Repo reminders

`k8s/eks/statefulset.yaml` already includes:

```yaml
storageClassName: gp2
```

inside:

```yaml
volumeClaimTemplates:
```

`k8s/eks/deployment.yaml` already uses Docker Hub:

```yaml
image: qasem2002/posts-backend-api:1.1
imagePullPolicy: Always
```

The EKS deployment was proven working, including Ingress, HPA scaling, MongoDB pod recovery, and persistent data after pod deletion.
