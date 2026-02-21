# Cloud Deployment Guide

Deploy Unweave to cloud platforms with GPU acceleration.

## Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐
│   CDN / Static   │     │   GPU Container   │
│   (Frontend)     │────▶│   (Backend API)   │
│   React SPA      │     │   FastAPI + AI    │
└──────────────────┘     └──────────────────┘
      Vercel /                Azure ACI /
      Netlify /               AWS ECS /
      CloudFront              GCP Cloud Run
```

**Recommended:** Deploy frontend as static site (CDN) and backend as a GPU container.

---

## Quick Cloud Deploy

### 1. Build the Frontend
```bash
cd frontend
npm run build
# Output: frontend/dist/ — deploy this folder to any static host
```

### 2. Build and Push Backend Image
```bash
# Build for NVIDIA GPU (cloud default)
docker build -t unweave-backend:latest -f backend/Dockerfile backend/

# Tag and push to your registry
docker tag unweave-backend:latest <your-registry>/unweave-backend:latest
docker push <your-registry>/unweave-backend:latest
```

---

## Azure

### Azure Container Instances (ACI) — GPU

```bash
# Create resource group
az group create --name unweave-rg --location eastus

# Deploy with GPU
az container create \
  --resource-group unweave-rg \
  --name unweave-backend \
  --image <your-acr>.azurecr.io/unweave-backend:latest \
  --cpu 4 \
  --memory 16 \
  --gpu-count 1 \
  --gpu-sku V100 \
  --ports 8000 \
  --environment-variables \
    CLOUD_MODE=true \
    DEVICE_OVERRIDE=cuda \
    MAX_FILE_SIZE_MB=100 \
  --ip-address public
```

**Available GPU SKUs:** K80, P100, V100, T4

### Azure Container Apps

```bash
az containerapp create \
  --name unweave-backend \
  --resource-group unweave-rg \
  --image <your-acr>.azurecr.io/unweave-backend:latest \
  --target-port 8000 \
  --ingress external \
  --cpu 4.0 \
  --memory 16.0Gi \
  --env-vars CLOUD_MODE=true DEVICE_OVERRIDE=cuda
```

### Azure Static Web Apps (Frontend)
```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy frontend
cd frontend
swa deploy dist/ --env production
```

---

## AWS

### Amazon ECS with GPU

1. **Create ECR repository and push image:**
   ```bash
   aws ecr create-repository --repository-name unweave-backend
   
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   
   docker tag unweave-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/unweave-backend:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/unweave-backend:latest
   ```

2. **Task Definition (GPU):**
   ```json
   {
     "family": "unweave-backend",
     "requiresCompatibilities": ["EC2"],
     "containerDefinitions": [{
       "name": "unweave-backend",
       "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/unweave-backend:latest",
       "memory": 16384,
       "cpu": 4096,
       "portMappings": [{"containerPort": 8000}],
       "environment": [
         {"name": "CLOUD_MODE", "value": "true"},
         {"name": "DEVICE_OVERRIDE", "value": "cuda"}
       ],
       "resourceRequirements": [{
         "type": "GPU",
         "value": "1"
       }]
     }]
   }
   ```

3. **Use `p3.2xlarge` (V100) or `g4dn.xlarge` (T4) EC2 instances** with the ECS-GPU-optimized AMI.

### AWS Amplify (Frontend)
```bash
# Connect your GitHub repo to Amplify
# Build settings: cd frontend && npm run build
# Publish directory: frontend/dist
```

---

## Google Cloud Platform

### Cloud Run with GPU

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/<project-id>/unweave-backend backend/

# Deploy with GPU
gcloud run deploy unweave-backend \
  --image gcr.io/<project-id>/unweave-backend:latest \
  --platform managed \
  --region us-central1 \
  --port 8000 \
  --memory 16Gi \
  --cpu 4 \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --set-env-vars CLOUD_MODE=true,DEVICE_OVERRIDE=cuda,MAX_FILE_SIZE_MB=100 \
  --allow-unauthenticated
```

### Firebase Hosting (Frontend)
```bash
npm install -g firebase-tools
firebase init hosting  # Set public dir to frontend/dist
firebase deploy
```

---

## Docker Compose (Cloud)

For VM-based deployments (EC2, Compute Engine, Azure VM):

```bash
# Clone on the VM
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave

# Deploy with cloud optimizations
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml up -d --build
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE_OVERRIDE` | *(auto)* | Force GPU device: `cuda`, `mps`, `directml`, `cpu` |
| `CLOUD_MODE` | `false` | Enable cloud optimizations (shorter retention, more logging) |
| `MAX_FILE_SIZE_MB` | `50` | Maximum upload file size |
| `CLEANUP_INTERVAL_SECONDS` | `3600` | Stem file retention period |
| `WORKERS` | `1` | Uvicorn workers (keep 1 for GPU workloads) |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |

---

## Cost Optimization

| Strategy | Savings | Trade-off |
|----------|---------|-----------|
| Use T4/L4 GPUs instead of V100/A100 | 50-70% | Slightly slower processing |
| Spot/Preemptible instances | 60-90% | May be interrupted |
| Scale to zero when idle | ~100% idle cost | Cold start on first request |
| CPU fallback for low traffic | 80% | Slower processing (3-5 min) |
| Use smaller model (`htdemucs`) | Slightly faster | 4 stems instead of 6 |

### Recommended Configs by Scale

| Scale | GPU | Instance | Est. Cost/mo |
|-------|-----|----------|-------------|
| Hobby | CPU | t3.medium | ~$30 |
| Small | T4 | g4dn.xlarge | ~$150 |
| Medium | L4 | g6.xlarge | ~$250 |
| Large | A100 | p4d.24xlarge | ~$1000+ |

---

## Health Monitoring

All deployments include a health endpoint:

```bash
curl https://your-domain.com/health
```

Use this for:
- Load balancer health checks
- Container orchestration liveness probes
- Monitoring dashboards (Datadog, CloudWatch, etc.)
