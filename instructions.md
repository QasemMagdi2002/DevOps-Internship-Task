# AWS EKS Deployment Instructions

The cluster has been torn down. Use this document to bring everything back up from scratch.

One important note: deleting the EKS cluster removes the EBS CSI add-on, OIDC provider, IAM role, node group, and all cluster resources. That means the EBS CSI driver setup needs to run again each time unless you bake it into `eks-cluster.yaml`. The steps below cover everything.

Run all commands from the project root.

---

## Prerequisites

- AWS CLI configured with permissions to create EKS resources
- eksctl installed
- kubectl installed
- Helm installed
- Docker installed

---

## 1. Create the EKS Cluster

```powershell
cd D:\Projects\DevOps-Internship-Task

eksctl create cluster -f eks-cluster.yaml
```

This takes a few minutes. Wait for it to finish before moving on.

Verify the cluster came up cleanly:

```powershell
kubectl get nodes
kubectl get pods -A
kubectl top nodes
```

---

## 2. Install the NGINX Ingress Controller

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

Verify the controller is running and has received an external AWS DNS name:

```powershell
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

Don't proceed to the next step until the `ingress-nginx-controller` service shows an external hostname. It can take a minute or two.

---

## 3. Install the AWS EBS CSI Driver

MongoDB PersistentVolumeClaims won't bind on EKS without this. The steps below set up the OIDC provider, create the IAM role, and install the add-on.

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

Verify the driver pods are running and the storage class is available:

```powershell
kubectl get pods -n kube-system | findstr ebs
kubectl get storageclass
```

---

## 4. Deploy the Application Foundation

Apply the namespace, config, and MongoDB manifests in order:

```powershell
kubectl apply -f k8s/eks/namespace.yml
kubectl apply -f k8s/eks/configmap.yaml
kubectl apply -f k8s/eks/secret.yaml
kubectl apply -f k8s/eks/service.yaml
kubectl apply -f k8s/eks/statefulset.yaml
```

Watch the MongoDB pods come up:

```powershell
kubectl get pods -n posts-app -w
```

All three should reach `1/1 Running`:

```
mongo-0   1/1 Running
mongo-1   1/1 Running
mongo-2   1/1 Running
```

Then confirm the PVCs bound correctly to gp2 volumes:

```powershell
kubectl get pvc -n posts-app
```

```
mongo-data-mongo-0   Bound   ...   gp2
mongo-data-mongo-1   Bound   ...   gp2
mongo-data-mongo-2   Bound   ...   gp2
```

If any PVC is stuck in `Pending`, the EBS CSI driver likely isn't ready yet — give it another minute and check the driver pods again.

---

## 5. Initialize the MongoDB Replica Set

```powershell
kubectl apply -f k8s/eks/replicaset.yaml
```

Check the job completed successfully:

```powershell
kubectl logs job/mongo-init-replica-set -n posts-app
```

Then confirm replica set status directly on `mongo-0`:

```powershell
kubectl exec -it mongo-0 -n posts-app -- mongosh --eval "rs.status()"
```

You should see 1 PRIMARY and 2 SECONDARY members. If the job fails or the replica set shows an unexpected state, check whether all three MongoDB pods were fully running before this step.

---

## 6. Deploy the Backend, HPA, and Ingress

```powershell
kubectl apply -f k8s/eks/deployment.yaml
kubectl apply -f k8s/eks/hpa.yaml
kubectl apply -f k8s/eks/ingress.yaml
```

Verify everything is running:

```powershell
kubectl get all -n posts-app
kubectl get hpa -n posts-app
kubectl get ingress -n posts-app
```

---

## 7. Test the API Through Ingress

Get the LoadBalancer external DNS:

```powershell
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

Set it as a variable so the curl commands below are less repetitive:

```powershell
$LB="YOUR_LOAD_BALANCER_DNS_HERE"
```

Check health:

```powershell
curl http://$LB/health
```

List posts (empty at first):

```powershell
curl http://$LB/api/posts
```

Create a test post:

```powershell
Invoke-RestMethod `
  -Uri "http://$LB/api/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"EKS Ingress Test","content":"Created through AWS EKS Ingress","author":"Qasem"}'
```

Confirm it was saved:

```powershell
curl http://$LB/api/posts
```

---

## 8. Test HPA Autoscaling

Start a load generator that hammers the `/cpu` endpoint:

```powershell
kubectl run load-generator -n posts-app --image=busybox:1.36 --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://posts-backend-service/cpu; done"
```

Watch HPA metrics update in one terminal:

```powershell
kubectl get hpa -n posts-app -w
```

And backend pod count in another:

```powershell
kubectl get pods -n posts-app -w
```

The backend should scale from 1 replica up to 5. Once you stop the load generator, Kubernetes will scale it back down — this takes a few minutes since it deliberately avoids flapping.

```powershell
kubectl delete pod load-generator -n posts-app
```

---

## 9. Test Failover

**Backend pod recovery:**

Delete the running backend pod and immediately check whether the API stays responsive:

```powershell
kubectl delete pod -n posts-app -l app=posts-backend
curl http://$LB/health
curl http://$LB/api/posts
```

The Deployment should bring a replacement up quickly.

**MongoDB pod recovery and data persistence:**

Delete `mongo-0` (the PRIMARY) and wait for it to come back:

```powershell
kubectl delete pod mongo-0 -n posts-app
kubectl get pods -n posts-app -w
```

Once it rejoins the replica set, verify the data is still there:

```powershell
curl http://$LB/api/posts
```

The posts you created earlier should still be present. The StatefulSet PVC keeps the data on the EBS volume even when the pod restarts.

---

## 10. Cleanup

> **Note:** Data persistence is demonstrated during pod deletion while the cluster is still running. Deleting the cluster itself removes everything including the EBS volumes, so do the failover tests before this step.

Delete the application namespaces first:

```powershell
kubectl delete namespace posts-app
kubectl delete namespace ingress-nginx
```

Then delete the cluster:

```powershell
eksctl delete cluster --name posts-api-cluster --region eu-north-1
```

After deletion, check the AWS Console for anything that didn't clean up automatically:

- EKS clusters
- EC2 Load Balancers
- EC2 Volumes
- CloudFormation stacks

Leftover volumes and load balancers will continue incurring charges if not removed.