/**
 * Path Resolution Service
 * 
 * Handles file path resolution for different runtime environments (native vs containerized).
 * Follows SOLID principles with clear interfaces and dependency injection.
 */

import { resolve, join, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Interface for path resolution strategies
 */
export interface PathResolver {
  /**
   * Resolves a file path for the current environment
   * @param inputPath - The input file path to resolve
   * @returns The resolved absolute path
   * @throws Error if path cannot be resolved or is invalid
   */
  resolvePath(inputPath: string): string;
  
  /**
   * Gets the appropriate data directory for persistent storage
   * @returns The data directory path
   */
  getDataDirectory(): string;
}

/**
 * Environment detection utility
 */
export class EnvironmentDetector {
  /**
   * Detects if running in a Docker container
   * Uses standard Docker environment indicators
   */
  static isDockerEnvironment(): boolean {
    // Check for standard Docker environment variables
    if (process.env.DOCKER_CONTAINER === 'true') {
      return true;
    }
    
    // Check for common Docker indicators
    if (process.env.container === 'docker' || process.env.DOCKER_HOST) {
      return true;
    }
    
    // Fallback: check for Docker-specific filesystem indicators
    return existsSync('/.dockerenv');
  }
  
  /**
   * Gets the runtime environment type
   */
  static getEnvironmentType(): 'docker' | 'native' {
    return this.isDockerEnvironment() ? 'docker' : 'native';
  }
}

/**
 * Native environment path resolver
 * Used when running directly on the host system
 */
export class NativePathResolver implements PathResolver {
  resolvePath(inputPath: string): string {
    if (!inputPath) {
      throw new Error('Path cannot be empty');
    }
    
    try {
      return resolve(inputPath);
    } catch (error) {
      throw new Error(`Failed to resolve path "${inputPath}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  getDataDirectory(): string {
    const customDir = process.env.MCP_CLIPBOARD_DATA_DIR;
    if (customDir) {
      return resolve(customDir);
    }
    
    return join(homedir(), '.mcp-clipboard');
  }
}

/**
 * Docker environment path resolver
 * Handles path mapping between host and container volumes
 */
export class DockerPathResolver implements PathResolver {
  private readonly hostHomePath: string;
  private readonly hostWorkingPath: string;
  
  constructor(
    hostHomePath: string = '/host/home',
    hostWorkingPath: string = '/host/pwd'
  ) {
    this.hostHomePath = hostHomePath;
    this.hostWorkingPath = hostWorkingPath;
  }
  
  resolvePath(inputPath: string): string {
    if (!inputPath) {
      throw new Error('Path cannot be empty');
    }
    
    try {
      const resolvedPath = resolve(inputPath);
      
      // For Docker, we need to map host paths to volume mounts
      return this.mapHostPathToContainer(resolvedPath);
    } catch (error) {
      throw new Error(`Failed to resolve Docker path "${inputPath}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  getDataDirectory(): string {
    // In Docker, use the mounted data directory
    return process.env.MCP_CLIPBOARD_DATA_DIR || '/app/data';
  }
  
  /**
   * Maps host file paths to container volume mount paths
   */
  private mapHostPathToContainer(hostPath: string): string {
    if (!isAbsolute(hostPath)) {
      throw new Error(`Expected absolute path, got: ${hostPath}`);
    }
    
    // Try to map to home directory volume first
    const homeVolumePath = this.tryMapToVolume(hostPath, homedir(), this.hostHomePath);
    if (homeVolumePath) {
      return homeVolumePath;
    }
    
    // Try to map to working directory volume
    const workingVolumePath = this.tryMapToVolume(hostPath, process.cwd(), this.hostWorkingPath);
    if (workingVolumePath) {
      return workingVolumePath;
    }
    
    // If no volume mapping possible, throw error instead of silent fallback
    throw new Error(
      `Cannot access file "${hostPath}" from Docker container. ` +
      `File must be under home directory (${homedir()}) or working directory (${process.cwd()}) ` +
      `to be accessible via volume mounts.`
    );
  }
  
  /**
   * Attempts to map a host path to a container volume mount
   */
  private tryMapToVolume(hostPath: string, hostBase: string, containerBase: string): string | null {
    if (!hostPath.startsWith(hostBase)) {
      return null;
    }
    
    const relativePath = hostPath.substring(hostBase.length);
    const containerPath = join(containerBase, relativePath);
    
    // Verify the mapped path exists in the container
    if (existsSync(containerPath)) {
      return containerPath;
    }
    
    return null;
  }
}

/**
 * Factory for creating appropriate path resolver based on environment
 */
export class PathResolverFactory {
  /**
   * Creates the appropriate path resolver for the current environment
   */
  static create(): PathResolver {
    const environmentType = EnvironmentDetector.getEnvironmentType();
    
    switch (environmentType) {
      case 'docker':
        return new DockerPathResolver();
      case 'native':
        return new NativePathResolver();
      default:
        throw new Error(`Unsupported environment type: ${environmentType}`);
    }
  }
}