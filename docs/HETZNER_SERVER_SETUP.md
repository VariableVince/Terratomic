# Hetzner Server Setup Guide for Terratomic

This guide provides detailed step-by-step instructions for setting up a new Hetzner server to host the Terratomic game. It's designed for users with limited server administration experience.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Creating a Hetzner Account](#creating-a-hetzner-account)
3. [Purchasing and Configuring a Server](#purchasing-and-configuring-a-server)
4. [Setting Up SSH Access](#setting-up-ssh-access)
5. [Initial Server Configuration](#initial-server-configuration)
6. [Setting Up External Services](#setting-up-external-services)
7. [Configuring Environment Variables](#configuring-environment-variables)
8. [Running the Setup Script](#running-the-setup-script)
9. [Deploying the Game](#deploying-the-game)
10. [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup)
11. [Monitoring and Maintenance](#monitoring-and-maintenance)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, you'll need:

- A computer with a terminal (Mac/Linux) or PowerShell/WSL (Windows)
- A credit card or PayPal for Hetzner payment
- A Cloudflare account (free tier works)
- A Docker Hub account (free tier works)
- A domain name (optional but recommended)
- Basic familiarity with using command-line interfaces

---

## Creating a Hetzner Account

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Click **"Register"** to create a new account
3. Fill in your personal information:
   - Email address
   - Password
   - Name and address
4. Verify your email address by clicking the link Hetzner sends you
5. Complete identity verification (Hetzner may request ID verification for new accounts)
6. Add a payment method:
   - Navigate to **Account → Billing**
   - Add a credit card or PayPal

---

## Purchasing and Configuring a Server

### Step 1: Create a New Project

1. Log in to the [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Click **"+ New Project"**
3. Name it something memorable like "Terratomic Production" or "Terratomic Staging"

### Step 2: Create a Server

1. Click **"Add Server"** within your project
2. Choose a **Location** (datacenter):
   - **Falkenstein (fsn1)** - Germany, Central Europe
   - **Nuremberg (nbg1)** - Germany, Central Europe
   - **Helsinki (hel1)** - Finland, Northern Europe
   - **Ashburn (ash)** - USA, East Coast

   > 💡 **Tip:** Choose a location closest to your expected player base for the lowest latency.

3. Select an **Image** (Operating System):
   - Choose **Ubuntu 22.04** or **Ubuntu 24.04** (recommended)
   - The setup scripts are designed for Debian/Ubuntu-based systems

4. Choose a **Server Type**:

   | Server Type | vCPUs   | RAM   | Storage | Monthly Cost | Recommended For     |
   | ----------- | ------- | ----- | ------- | ------------ | ------------------- |
   | CX22        | 2 vCPU  | 4 GB  | 40 GB   | ~€4.85       | Development/Testing |
   | CX32        | 4 vCPU  | 8 GB  | 80 GB   | ~€9.59       | Small Production    |
   | CX42        | 8 vCPU  | 16 GB | 160 GB  | ~€17.85      | Medium Production   |
   | CX52        | 16 vCPU | 32 GB | 320 GB  | ~€36.05      | Large Production    |

   > 💡 **Recommendation:** Start with **CX32** for a small player base. You can upgrade later without data loss.

5. **Networking:**
   - Enable **Public IPv4** (required)
   - Enable **Public IPv6** (optional but recommended)

6. **SSH Key** (Very Important!):
   - Click **"Add SSH Key"**
   - See the next section for how to generate and add your SSH key
7. Leave other options as default unless you have specific requirements

8. Click **"Create & Buy Now"**

### Step 3: Note Your Server Details

After creation, note down:

- **Server IP Address** (e.g., `116.203.xxx.xxx`)
- **Server Name** (can be customized)

---

## Setting Up SSH Access

SSH (Secure Shell) allows you to securely connect to your server from your computer.

### Generating an SSH Key (If You Don't Have One)

#### On Windows (PowerShell):

```powershell
# Check if you already have an SSH key
Test-Path ~/.ssh/id_ed25519

# If the above returns False, generate a new key:
ssh-keygen -t ed25519 -C "your-email@example.com"

# Press Enter to accept default location
# Enter a passphrase (recommended) or press Enter for no passphrase

# View your public key (you'll need this for Hetzner)
Get-Content ~/.ssh/id_ed25519.pub
```

#### On Mac/Linux (Terminal):

```bash
# Check if you already have an SSH key
ls -la ~/.ssh/id_ed25519

# If file doesn't exist, generate a new key:
ssh-keygen -t ed25519 -C "your-email@example.com"

# Press Enter to accept default location
# Enter a passphrase (recommended) or press Enter for no passphrase

# View your public key
cat ~/.ssh/id_ed25519.pub
```

### Adding Your SSH Key to Hetzner

1. Copy your **public key** (the output from the `cat` or `Get-Content` command above)
2. In Hetzner Cloud Console, go to **Security → SSH Keys**
3. Click **"Add SSH Key"**
4. Paste your public key
5. Give it a name (e.g., "My Laptop")
6. Click **"Add SSH Key"**

### Testing SSH Connection

After your server is created:

```bash
# Connect to your server
ssh root@YOUR_SERVER_IP

# Example:
ssh root@116.203.123.45

# First connection will ask to verify the host - type 'yes'
```

If successful, you'll see the Ubuntu welcome screen and a command prompt like:

```
root@your-server-name:~#
```

---

## Initial Server Configuration

Once connected to your server via SSH, perform these initial security and configuration steps:

### Step 1: Update the System

```bash
apt update && apt upgrade -y
```

### Step 2: Set the Hostname (Optional)

```bash
# Set a meaningful hostname
hostnamectl set-hostname terratomic-eu

# Verify
hostname
```

### Step 3: Configure the Firewall

Hetzner servers come with `ufw` (Uncomplicated Firewall) pre-installed:

```bash
# Allow SSH (important - don't skip this!)
ufw allow OpenSSH

# Allow HTTP (for the game)
ufw allow 80/tcp

# Allow HTTPS (if using SSL directly)
ufw allow 443/tcp

# Enable the firewall
ufw enable

# Check status
ufw status
```

---

## Setting Up External Services

The Terratomic deployment requires several external services. Set these up before deploying.

### 1. Docker Hub Account

Docker Hub hosts your game's container images.

1. Go to [Docker Hub](https://hub.docker.com/) and create a free account
2. Create a new repository:
   - Click **"Create Repository"**
   - Name it (e.g., `terratomic`)
   - Set visibility to **Private** (recommended)
3. Generate an Access Token:
   - Go to **Account Settings → Security → Access Tokens**
   - Click **"New Access Token"**
   - Name it (e.g., "Deployment")
   - Set permissions to **Read, Write, Delete**
   - Copy the token and save it securely - you won't see it again!

### 2. Cloudflare Account

Cloudflare provides DNS, DDoS protection, and tunneling.

1. Go to [Cloudflare](https://dash.cloudflare.com/sign-up) and create a free account
2. Add your domain:
   - Click **"Add a Site"**
   - Enter your domain name
   - Select the **Free** plan
   - Follow the instructions to update your domain's nameservers

3. Get your API credentials:
   - Go to **My Profile → API Tokens**
   - Create a new token with permissions:
     - Zone → DNS → Edit
     - Zone → Zone → Read
     - Account → Cloudflare Tunnel → Edit
   - Copy and save the token

4. Get your Account ID:
   - On any domain's overview page, scroll down to **API** section
   - Copy the **Account ID**

### 3. Cloudflare R2 (Object Storage)

R2 is used for storing game replays and assets.

1. In Cloudflare dashboard, go to **R2**
2. Click **"Create bucket"**
3. Name it (e.g., `terratomic-replays`)
4. Generate R2 API credentials:
   - Go to **R2 → Manage R2 API Tokens**
   - Click **"Create API token"**
   - Set permissions to **Admin Read & Write**
   - Copy and save the **Access Key ID** and **Secret Access Key**

---

## Configuring Environment Variables

### Step 1: Create Environment Files

On your local machine (where you'll run deployments from), create the environment files:

```bash
# Navigate to your Terratomic project directory
cd /path/to/Terratomic_Private

# Copy the example environment file
cp example.env .env
```

### Step 2: Edit the .env File

Open `.env` in a text editor and fill in your values:

```bash
# SSH Configuration
SSH_KEY=~/.ssh/id_ed25519

# Docker Configuration
DOCKER_USERNAME=your-dockerhub-username
DOCKER_REPO=terratomic
DOCKER_TOKEN=dckr_pat_xxxxxxxxxxxxxxxx

# Admin credentials (generate a secure random string)
ADMIN_TOKEN=your-secure-random-admin-token-here

# Cloudflare Configuration
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_API_TOKEN=your-cloudflare-api-token
DOMAIN=terratomic.io

# R2 Configuration
R2_ACCESS_KEY=your-r2-access-key
R2_SECRET_KEY=your-r2-secret-key
R2_BUCKET=terratomic-replays

# Server Hosts (use your Hetzner server IPs)
SERVER_HOST_BLUE=xxx.xxx.xxx.xxx
SERVER_HOST_GREEN=xxx.xxx.xxx.xxx

# Basic Auth (optional, for staging environments)
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=secure-password
```

### Step 3: Create Environment-Specific Files (Optional)

For different environments (production vs staging), create separate files:

```bash
# For production
cp .env .env.prod

# For staging
cp .env .env.staging
```

Edit each file with environment-specific values.

---

## Running the Setup Script

The setup script installs Docker, creates the deployment user, configures network settings, and sets up monitoring.

### Step 1: Connect to Your Server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Download and Run the Setup Script

You can either copy the script manually or clone the repository:

#### Option A: Copy the Script Manually

1. On your local machine, open `setup.sh` and copy its contents
2. On the server, create the file:
   ```bash
   nano /root/setup.sh
   ```
3. Paste the contents and save (Ctrl+X, Y, Enter)
4. Make it executable:
   ```bash
   chmod +x /root/setup.sh
   ```

#### Option B: SCP the Script

```bash
# From your local machine
scp setup.sh root@YOUR_SERVER_IP:/root/setup.sh
```

### Step 3: Run the Setup Script

```bash
/root/setup.sh
```

The script will:

1. ✅ Update the system
2. ✅ Install Docker
3. ✅ Create the `openfront` user for deployments
4. ✅ Configure SSH keys for the deployment user
5. ✅ Optimize network settings (UDP buffer sizes for WebSocket/QUIC)

### Step 4: Verify the Setup

```bash
# Check Docker is running
docker ps

# Check the openfront user exists
id openfront
```

---

## Deploying the Game

Deployments are run from your **local machine**, not the server.

### Step 1: Ensure Prerequisites

On your local machine:

- Node.js 20+ installed
- Docker installed and running
- Git repository cloned
- Environment files configured (`.env`)

### Step 2: Install Dependencies

```bash
cd /path/to/Terratomic_Private
npm install
```

### Step 3: Run the Deployment

The deployment script builds the Docker image, pushes it to Docker Hub, and updates the server:

```bash
# Deploy to production blue server
./deploy.sh prod blue

# Deploy to production green server
./deploy.sh prod green

# Deploy with a custom subdomain
./deploy.sh prod blue custom-subdomain

# Deploy with basic authentication (useful for staging)
./deploy.sh staging blue --enable_basic_auth
```

### Deployment Script Parameters

```
./deploy.sh [environment] [host] [subdomain] [--enable_basic_auth]
```

| Parameter           | Values              | Description                            |
| ------------------- | ------------------- | -------------------------------------- |
| environment         | `prod` or `staging` | Determines which `.env.*` file to load |
| host                | `blue` or `green`   | Which server to deploy to              |
| subdomain           | (optional)          | Custom subdomain override              |
| --enable_basic_auth | (flag)              | Enable HTTP basic auth (for testing)   |

### Step 4: Verify Deployment

After deployment, verify the game is running:

```bash
# SSH into the server
ssh openfront@YOUR_SERVER_IP

# Check running containers
docker ps

# View container logs
docker logs openfront-prod-blue

# Check the game is responding
curl http://localhost:80
```

---

## Cloudflare Tunnel Setup

Cloudflare Tunnel provides secure HTTPS access to your game without exposing your server directly to the internet.

### Why Use Cloudflare Tunnel?

- ✅ Free SSL/TLS certificates
- ✅ DDoS protection
- ✅ No need to open ports to the internet
- ✅ WebSocket support
- ✅ Automatic failover

### Setting Up the Tunnel

1. In Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels**
2. Click **"Create a tunnel"**
3. Choose **"Cloudflared"** as the connector
4. Name your tunnel (e.g., `terratomic-eu`)
5. Follow the installation instructions provided by Cloudflare

The tunnel configuration is handled automatically by the Docker container, which includes `cloudflared`. The credentials are passed via environment variables during deployment.

### DNS Configuration

After setting up the tunnel, configure DNS records:

1. Go to your domain's DNS settings in Cloudflare
2. The tunnel should automatically create the necessary CNAME records
3. Verify your subdomain points to the tunnel

---

## Monitoring and Maintenance

### Viewing Logs

```bash
# SSH to the server
ssh openfront@YOUR_SERVER_IP

# View container logs
docker logs openfront-prod-blue

# Follow logs in real-time
docker logs -f openfront-prod-blue

# View last 100 lines
docker logs --tail 100 openfront-prod-blue
```

### Checking Server Resources

```bash
# CPU and memory usage
htop

# Disk usage
df -h

# Network connections
ss -tuln
```

### Restarting the Game

```bash
# Restart the container
docker restart openfront-prod-blue

# If there are issues, stop and remove, then redeploy
docker stop openfront-prod-blue
docker rm openfront-prod-blue
# Then run deploy.sh again from your local machine
```

### Updating the Game

Simply run the deployment script again - it will:

1. Build a new Docker image with your changes
2. Push it to Docker Hub
3. Stop the old container
4. Start a new container with the updated image

```bash
./deploy.sh prod blue
```

### Automatic Cleanup

The deployment script automatically cleans up:

- Old Docker images
- Stopped containers
- Temporary environment files

---

## Troubleshooting

### Common Issues and Solutions

#### Cannot Connect via SSH

```bash
# Verify your SSH key is loaded
ssh-add -l

# If empty, add your key
ssh-add ~/.ssh/id_ed25519

# Try with verbose output
ssh -v root@YOUR_SERVER_IP
```

#### Docker Permission Denied

```bash
# Make sure the openfront user is in the docker group
sudo usermod -aG docker openfront

# Log out and back in, or run:
newgrp docker
```

#### Container Won't Start

```bash
# Check for existing containers with the same name
docker ps -a | grep openfront

# Remove problematic containers
docker rm -f container-name

# Check Docker logs for errors
docker logs openfront-prod-eu
```

#### Port Already in Use

```bash
# Find what's using port 80
sudo lsof -i :80

# Or
sudo netstat -tlnp | grep :80

# Kill the process if needed
sudo kill -9 PID
```

#### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean up Docker resources
docker system prune -a

# Remove old logs (careful!)
sudo journalctl --vacuum-size=100M
```

#### Game Not Accessible

1. Check the container is running: `docker ps`
2. Check the firewall: `ufw status`
3. Check Cloudflare tunnel status
4. Test locally: `curl http://localhost:80`
5. Check container logs for errors

### Getting Help

If you encounter issues not covered here:

1. Check the container logs first
2. Review the Cloudflare tunnel logs
3. Check Hetzner's status page for outages
4. Search the GitHub repository issues

---

## Quick Reference

### Useful Commands

| Command                    | Description             |
| -------------------------- | ----------------------- |
| `ssh openfront@SERVER_IP`  | Connect to server       |
| `docker ps`                | List running containers |
| `docker logs -f CONTAINER` | Follow container logs   |
| `docker restart CONTAINER` | Restart container       |
| `docker system prune -a`   | Clean up Docker         |
| `htop`                     | View system resources   |
| `ufw status`               | Check firewall rules    |

### Important Paths on Server

| Path               | Description                   |
| ------------------ | ----------------------------- |
| `/home/openfront/` | Deployment user home          |
| `/var/log/nginx/`  | Nginx logs (inside container) |

### Environment Files

| File           | Description                |
| -------------- | -------------------------- |
| `.env`         | Base environment variables |
| `.env.prod`    | Production overrides       |
| `.env.staging` | Staging overrides          |

---

## Security Checklist

Before going to production, verify:

- [ ] SSH key authentication is enabled
- [ ] Root password login is disabled
- [ ] Firewall (ufw) is enabled
- [ ] Only necessary ports are open (80, 443)
- [ ] Docker images are from trusted sources
- [ ] Environment variables contain strong passwords
- [ ] Basic auth is enabled for staging/test environments
- [ ] Cloudflare Tunnel is properly configured
- [ ] Regular backups are scheduled (if applicable)

---

## Cost Estimation

Monthly costs for a typical setup:

| Service                | Cost              |
| ---------------------- | ----------------- |
| Hetzner CX32 Server    | ~€10/month        |
| Cloudflare (Free tier) | €0                |
| Docker Hub (Free tier) | €0                |
| Domain name            | ~€10-15/year      |
| **Total**              | **~€10-15/month** |

> 💡 **Tip:** Hetzner bills hourly, so you only pay for what you use. Delete unused servers to avoid charges.

---

_Last updated: January 2026_
