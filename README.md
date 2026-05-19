# DevOps Internship Task

## Setup Instructions: [Open instructions.md](instructions.md)

This repo contains a small Posts Backend API and the DevOps configuration used to containerize it, deploy it to Kubernetes, and run it on Amazon EKS.

The app uses Node.js, Express, and MongoDB. It exposes a CRUD API for posts, stores data through Mongoose, and includes health and CPU load endpoints for Kubernetes checks and autoscaling tests.

The deployment work covers Docker images, Kubernetes workloads, MongoDB stateful storage, ingress routing, replica set initialization, and HPA scaling.

## Prerequisites

The operational workflow expects:

- AWS CLI configured with permissions to create EKS resources.
- eksctl installed.
- kubectl installed.
- Helm installed.
- Docker installed.


## Implementation 

The backend includes:

- Express API for posts.
- Mongoose model for MongoDB documents.
- CRUD routes for creating, listing, reading, updating, and deleting posts.
- Middleware for Helmet, CORS, rate limiting, JSON parsing, and request logging.
- Health endpoint for Kubernetes probes.
- CPU endpoint for autoscaling tests.

The deployment includes:

- Production Dockerfile using a multi stage Node 22 Alpine build.
- Development Dockerfile using Node 22 Alpine and nodemon.
- Local Kubernetes manifests under `k8s/local`.
- EKS Kubernetes manifests under `k8s/eks`.
- MongoDB StatefulSet with 3 replica set members and persistent storage.
- MongoDB replica set initialization job.
- ClusterIP services for internal communication.
- NGINX ingress configuration for public HTTP access.
- HPA configuration that scales the backend from 1 to 5 pods at 70 percent CPU.
- eksctl cluster configuration for the EKS cluster.

## Project structure

- `src/server.js` starts Express, connects to MongoDB, registers middleware, and exposes health routes.
- `src/routes/routes.js` defines the posts CRUD API.
- `src/models/Post.js` defines the Mongoose post schema.
- `Dockerfile` builds the production container image.
- `Dockerfile.dev` runs the app with nodemon during development.
- `k8s/local` contains the local Kubernetes manifests.
- `k8s/eks` contains the EKS Kubernetes manifests.
- `eks-cluster.yaml` defines the EKS cluster used by eksctl.
- `instructions.md` contains the EKS rerun, testing, failover, and cleanup workflow.

## API behavior

The API runs on port `3000` by default.

- `GET /` returns a basic running message and the main endpoint paths.
- `GET /health` returns API health and MongoDB connection status.
- `GET /cpu` creates short CPU load for HPA testing.
- `POST /api/posts` creates a post.
- `GET /api/posts` lists posts from newest to oldest.
- `GET /api/posts/:id` returns one post by ID.
- `PUT /api/posts/:id` updates one post by ID.
- `DELETE /api/posts/:id` deletes one post by ID.

A post contains:

```json
{
  "title": "First post",
  "content": "This is the post content.",
  "author": "Qasem"
}
```

`title` and `content` are required. `author` defaults to `Anonymous`.

## Runtime configuration

The app reads these environment variables:

- `NODE_ENV` sets the app environment.
- `PORT` sets the API port.
- `MONGO_URI` sets the MongoDB connection string.

Local development uses `.env.example` as the template. Kubernetes uses a ConfigMap for `NODE_ENV` and `PORT`, and a Secret for `MONGO_URI`.

## Docker setup

The production image uses Node 22 Alpine. It installs production dependencies with `npm ci --omit=dev`, copies the app source, exposes port `3000`, and runs the process as the `node` user.

The development image also uses Node 22 Alpine and starts the app with `npm run dev`.

## Docker Hub image

The production image used by EKS is:

```text
qasem2002/posts-backend-api:1.1
```

The EKS Deployment pulls this image with `imagePullPolicy: Always`.

## Kubernetes setup

The local and EKS manifests follow the same main structure:

- Namespace `posts-app`.
- Backend Deployment.
- Backend ClusterIP Service.
- Backend ConfigMap.
- Backend Secret.
- MongoDB headless Service.
- MongoDB StatefulSet.
- MongoDB replica set initialization Job.
- HPA for backend scaling.
- Ingress for external HTTP routing.

The local deployment uses image `posts-backend-api:local`. The EKS deployment uses image `qasem2002/posts-backend-api:1.1`.

## EKS setup

`eks-cluster.yaml` defines the EKS cluster:

- Cluster name `posts-api-cluster`.
- Region `eu-north-1`.
- Kubernetes version `1.31`.
- Availability zones `eu-north-1a` and `eu-north-1b`.
- Managed node group `posts-workers`.
- Worker node type `t3.small`.
- Desired capacity of 3 nodes.
- Minimum node count of 2.
- Maximum node count of 4.
- Node volume size of 20 GB.

The EKS MongoDB StatefulSet uses `storageClassName: gp2` for PersistentVolumeClaims. The EBS CSI driver must exist on the cluster before MongoDB PVCs bind correctly.

## Validation summary

The deployment was validated on AWS EKS by checking:

- API access through the NGINX Ingress LoadBalancer.
- Successful post creation and retrieval through the public endpoint.
- MongoDB replica set status with 1 PRIMARY and 2 SECONDARY members.
- HPA scaling from 1 backend pod to 5 backend pods under CPU load.
- Backend pod deletion and automatic recovery through the Deployment.
- MongoDB pod deletion and data persistence through StatefulSet PVCs.

## Notes

This repo focuses on deployment practice. It includes the app, container build files, Kubernetes manifests, EKS cluster config, ingress, autoscaling, stateful MongoDB storage, and operational test steps.

The project does not include automated tests yet.
