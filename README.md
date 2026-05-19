# DevOps Internship Task

## Setup Instructions: [Open instructions.md](instructions.md)

This repo contains a small Posts Backend API along with everything needed to containerize it, deploy it to Kubernetes, and run it on Amazon EKS.

The app is built with Node.js, Express, and MongoDB. It exposes a CRUD API for posts, persists data through Mongoose, and includes a health endpoint for Kubernetes probes and a CPU load endpoint specifically for testing HPA autoscaling.

The deployment side covers Docker images, Kubernetes workloads, MongoDB stateful storage, ingress routing, replica set initialization, and HPA scaling.

## Prerequisites

You'll need the following configured and available before anything works:

- AWS CLI configured with permissions to create EKS resources
- eksctl installed
- kubectl installed
- Helm installed
- Docker installed

## Implementation

The backend includes:

- Express API for posts
- Mongoose model for MongoDB documents
- CRUD routes for creating, listing, reading, updating, and deleting posts
- Middleware for Helmet, CORS, rate limiting, JSON parsing, and request logging
- Health endpoint for Kubernetes liveness/readiness probes
- CPU endpoint for generating short load bursts during HPA tests

The deployment includes:

- Production Dockerfile using a multi-stage Node 22 Alpine build
- Development Dockerfile using Node 22 Alpine with nodemon
- Local Kubernetes manifests under `k8s/local`
- EKS Kubernetes manifests under `k8s/eks`
- MongoDB StatefulSet with 3 replica set members and persistent storage
- MongoDB replica set initialization job
- ClusterIP services for internal pod communication
- NGINX Ingress for public HTTP access
- HPA that scales the backend from 1 to 5 pods at 70% CPU utilization
- eksctl cluster config for spinning up the EKS cluster

## Project Structure

- `src/server.js` — starts Express, connects to MongoDB, registers middleware, and mounts health routes
- `src/routes/routes.js` — defines the posts CRUD API
- `src/models/Post.js` — Mongoose post schema
- `Dockerfile` — production container image
- `Dockerfile.dev` — development image with nodemon
- `k8s/local/` — local Kubernetes manifests
- `k8s/eks/` — EKS Kubernetes manifests
- `eks-cluster.yaml` — EKS cluster definition for eksctl
- `instructions.md` — full workflow for deploying, testing, and cleaning up on EKS

## API Behavior

The API runs on port `3000` by default.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Returns a basic running message with available endpoint paths |
| GET | `/health` | Returns API health and MongoDB connection status |
| GET | `/cpu` | Generates a short CPU spike for HPA testing |
| POST | `/api/posts` | Creates a post |
| GET | `/api/posts` | Lists all posts, newest first |
| GET | `/api/posts/:id` | Returns a single post by ID |
| PUT | `/api/posts/:id` | Updates a post by ID |
| DELETE | `/api/posts/:id` | Deletes a post by ID |

A post looks like this:

```json
{
  "title": "First post",
  "content": "This is the post content.",
  "author": "Qasem"
}
```

`title` and `content` are required. `author` is optional and defaults to `Anonymous`.

## Runtime Configuration

The app reads from three environment variables:

- `NODE_ENV` — sets the environment (development, production)
- `PORT` — overrides the default port
- `MONGO_URI` — MongoDB connection string

For local development, copy `.env.example` and fill in your values. On Kubernetes, `NODE_ENV` and `PORT` come from a ConfigMap, and `MONGO_URI` from a Secret.

## Docker Setup

The production image is built on Node 22 Alpine. Dependencies are installed with `npm ci --omit=dev` to keep the image lean, and the process runs as the `node` user rather than root.

The development image uses the same base and starts the app via `npm run dev` with nodemon watching for changes.

## Docker Hub Image

The production image used by the EKS deployment is:

```
qasem2002/posts-backend-api:1.1
```

The EKS Deployment manifest pulls it with `imagePullPolicy: Always`.

## Kubernetes Setup

Both the local and EKS manifests share the same overall structure, with the main difference being the container image reference:

- Namespace: `posts-app`
- Backend Deployment + ClusterIP Service
- ConfigMap and Secret for environment config
- MongoDB headless Service + StatefulSet (3 members)
- Replica set initialization Job
- HPA targeting 70% CPU across 1–5 backend replicas
- Ingress for external HTTP routing

Local uses `posts-backend-api:local`. EKS uses `qasem2002/posts-backend-api:1.1`.

## EKS Setup

The cluster is defined in `eks-cluster.yaml` and managed with eksctl:

- Cluster name: `posts-api-cluster`
- Region: `eu-north-1`
- Kubernetes version: `1.31`
- Availability zones: `eu-north-1a` and `eu-north-1b`
- Node group: `posts-workers` using `t3.small` instances
- Node capacity: desired 3, min 2, max 4
- Node volume size: 20 GB

MongoDB PVCs use `storageClassName: gp2`, so the EBS CSI driver needs to be installed before applying the StatefulSet — the instructions.md covers this.

## Validation

The deployment was tested end-to-end on AWS EKS. Here's what was verified:

- API responding correctly through the NGINX Ingress LoadBalancer external DNS
- Post creation and retrieval working through the public endpoint
- MongoDB replica set healthy with 1 PRIMARY and 2 SECONDARY members
- HPA successfully scaled the backend from 1 pod up to 5 under sustained CPU load. After the load generator is removed, Kubernetes gradually scales replicas down after a stabilization period.
- Backend pod deletion triggering automatic recovery via the Deployment
- MongoDB pod deletion (including `mongo-0`) with data intact afterward, confirmed by querying posts through the API