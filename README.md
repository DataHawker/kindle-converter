# Kindle Converter

A web-based ebook library manager that scans your NAS for EPUB files and sends them to Kindle devices via email.

## Features

- Scans NAS for EPUB files
- Sends books to Kindle via email (Amazon auto-converts EPUBs)
- Manage multiple Kindle devices
- Delete books from library
- Mobile-responsive web interface

## Architecture

- **API Server**: Node.js Express app that handles library scanning, file operations, and email sending
- **Web Frontend**: Static HTML/JS served by nginx with API proxy

## Local Development

```bash
# Copy env file
cp .env.example .env
# Edit with your SMTP credentials

# Start with docker-compose
docker-compose up -d

# Access at http://localhost:3000
```

## Kubernetes Deployment

The app is designed to run in a K8s cluster alongside media services.

### Prerequisites

1. Push the API image to GitHub Container Registry:
   ```bash
   # GitHub Actions will auto-build on push to main
   # Or manually trigger the workflow
   ```

2. Create the SMTP secret with your credentials:
   ```bash
   # Edit k8s/secret.yaml with your SMTP credentials
   kubectl apply -f k8s/secret.yaml
   ```

### Deploy to Cluster

```bash
# Apply all K8s manifests
kubectl apply -f k8s/

# Or add to your GitOps repo
```

### K8s Resources

| Resource | Description |
|----------|-------------|
| `deployment.yaml` | API + nginx containers, mounts media-library PVC |
| `secret.yaml` | SMTP credentials (Gmail app password) |
| `configmap.yaml` | nginx config with API proxy |
| `ingress.yaml` | Ingress for kindle.home |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server (default: smtp.gmail.com) |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | Email username |
| `SMTP_PASS` | Email password (use Gmail app password) |
| `SMTP_SENDER` | From address |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/sync-library` | POST | Scan and return all EPUB files |
| `/api/send-books` | POST | Send books to Kindle email |
| `/api/delete-book` | POST | Delete a single book |
| `/api/delete-books` | POST | Bulk delete books |
| `/api/test-email` | POST | Test email configuration |

## Gmail Setup

1. Enable 2FA on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Add your sender email to Amazon's Approved Senders list
4. Use the app password in `SMTP_PASS`

## Kindle Email Setup

Each Kindle device has a unique email address. To find yours:

1. Go to Amazon > Manage Your Content and Devices
2. Click on Preferences tab
3. Scroll to "Personal Document Settings"
4. Find your Kindle email addresses

**Important**: Add your sender email to the "Approved Personal Document E-mail List" in Amazon settings.

## File Structure

```
kindle-converter/
├── api/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── web/
│   └── index.html
├── k8s/
│   ├── deployment.yaml
│   ├── secret.yaml
│   ├── configmap.yaml
│   └── ingress.yaml
├── .github/
│   └── workflows/
│       └── build.yaml
├── docker-compose.yml
└── README.md
```

## Troubleshooting

### Books not arriving on Kindle
- Check your sender email is in Amazon's approved list
- Verify SMTP settings in secret
- Check pod logs: `kubectl logs -n media deployment/kindle-converter -c api`

### Web interface issues
- Clear browser cache
- Check nginx logs: `kubectl logs -n media deployment/kindle-converter -c web`

## Managing the System

```bash
# View logs
kubectl logs -n media deployment/kindle-converter -c api -f
kubectl logs -n media deployment/kindle-converter -c web -f

# Restart deployment
kubectl rollout restart deployment/kindle-converter -n media

# Check status
kubectl get pods -n media -l app=kindle-converter
```
