#!/usr/bin/env bun

/**
 * Docker MCP Wrapper Script
 * 
 * This script allows MCP clients to communicate with the containerized
 * MCP Clipboard Server via Docker. It handles the stdio bridge between
 * the client and the Docker container.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const CONTAINER_NAME = 'mcp-clipboard-server';
const IMAGE_NAME = 'mcp-clipboard:latest';

/**
 * Check if Docker is available
 */
function checkDockerAvailable() {
  try {
    const result = spawn('docker', ['--version'], { stdio: 'pipe' });
    return new Promise((resolve) => {
      result.on('close', (code) => {
        resolve(code === 0);
      });
    });
  } catch (error) {
    return false;
  }
}

/**
 * Check if container is running
 */
function checkContainerRunning() {
  try {
    const result = spawn('docker', ['ps', '--filter', `name=${CONTAINER_NAME}`, '--format', '{{.Names}}'], { stdio: 'pipe' });
    return new Promise((resolve) => {
      let output = '';
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      result.on('close', () => {
        resolve(output.trim() === CONTAINER_NAME);
      });
    });
  } catch (error) {
    return false;
  }
}

/**
 * Start the container if not running
 */
async function ensureContainerRunning() {
  const isRunning = await checkContainerRunning();
  if (isRunning) {
    return true;
  }

  console.error('Starting MCP Clipboard container...');
  
  // Check if we have a docker-compose file
  const hasCompose = existsSync(join(process.cwd(), 'docker-compose.yml'));
  
  if (hasCompose) {
    // Use docker-compose
    const composeResult = spawn('docker-compose', ['up', '-d', 'mcp-clipboard'], { 
      stdio: ['pipe', 'pipe', 'inherit'] 
    });
    
    return new Promise((resolve) => {
      composeResult.on('close', (code) => {
        if (code === 0) {
          console.error('Container started successfully!');
          resolve(true);
        } else {
          console.error('Failed to start container with docker-compose');
          resolve(false);
        }
      });
    });
  } else {
    // Use docker run
    const dockerArgs = [
      'run', '-d',
      '--name', CONTAINER_NAME,
      '--restart', 'unless-stopped',
      '-v', `${process.cwd()}/data:/app/data`,
      IMAGE_NAME
    ];
    
    const dockerResult = spawn('docker', dockerArgs, { 
      stdio: ['pipe', 'pipe', 'inherit'] 
    });
    
    return new Promise((resolve) => {
      dockerResult.on('close', (code) => {
        if (code === 0) {
          console.error('Container started successfully!');
          resolve(true);
        } else {
          console.error('Failed to start container with docker run');
          resolve(false);
        }
      });
    });
  }
}

/**
 * Connect to the container and proxy stdio
 */
async function connectToContainer() {
  const dockerExec = spawn('docker', [
    'exec', '-i', CONTAINER_NAME,
    'bun', 'run', 'src/server.ts'
  ], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Pipe stdin to container
  process.stdin.pipe(dockerExec.stdin);
  
  // Pipe container output to stdout
  dockerExec.stdout.pipe(process.stdout);
  
  // Handle container exit
  dockerExec.on('close', (code) => {
    process.exit(code || 0);
  });
  
  // Handle process signals
  process.on('SIGINT', () => {
    dockerExec.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    dockerExec.kill('SIGTERM');
  });
}

/**
 * Main function
 */
async function main() {
  // Check if Docker is available
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.error('Error: Docker is not available. Please install Docker and try again.');
    process.exit(1);
  }

  // Ensure container is running
  const containerReady = await ensureContainerRunning();
  if (!containerReady) {
    console.error('Error: Failed to start MCP Clipboard container.');
    process.exit(1);
  }

  // Wait a moment for container to be fully ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Connect to container
  await connectToContainer();
}

// Show usage if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
MCP Clipboard Docker Wrapper

This script starts and connects to the MCP Clipboard Server running in Docker.

Usage:
  ${process.argv[0]} ${process.argv[1]}

Options:
  --help, -h    Show this help message

Environment Variables:
  MCP_CLIPBOARD_DATA_DIR    Directory for persistent data (default: ./data)

The script will:
1. Check if Docker is available
2. Start the MCP Clipboard container if not running
3. Connect your MCP client to the containerized server via stdio

Container Management:
- Container name: ${CONTAINER_NAME}
- Image name: ${IMAGE_NAME}
- Data volume: ./data (persisted)

For manual container management:
  docker-compose up -d     # Start with docker-compose
  docker-compose down      # Stop with docker-compose
  docker stop ${CONTAINER_NAME}  # Stop container manually
  docker rm ${CONTAINER_NAME}    # Remove container manually
`);
  process.exit(0);
}

// Run the main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});