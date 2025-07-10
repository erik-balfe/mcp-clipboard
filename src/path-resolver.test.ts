import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { homedir, cwd } from 'os';
import { join, resolve } from 'path';
import * as fs from 'fs';

import { 
  EnvironmentDetector, 
  NativePathResolver, 
  DockerPathResolver, 
  PathResolverFactory 
} from './path-resolver.js';

describe('EnvironmentDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isDockerEnvironment', () => {
    it('returns true when DOCKER_CONTAINER is set to true', () => {
      process.env.DOCKER_CONTAINER = 'true';
      expect(EnvironmentDetector.isDockerEnvironment()).toBe(true);
    });

    it('returns true when container env var is set to docker', () => {
      delete process.env.DOCKER_CONTAINER;
      process.env.container = 'docker';
      expect(EnvironmentDetector.isDockerEnvironment()).toBe(true);
    });

    it('returns true when DOCKER_HOST is set', () => {
      delete process.env.DOCKER_CONTAINER;
      delete process.env.container;
      process.env.DOCKER_HOST = 'unix:///var/run/docker.sock';
      expect(EnvironmentDetector.isDockerEnvironment()).toBe(true);
    });

    it('returns false when no Docker indicators present', () => {
      delete process.env.DOCKER_CONTAINER;
      delete process.env.container;
      delete process.env.DOCKER_HOST;
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(EnvironmentDetector.isDockerEnvironment()).toBe(false);
      
      mockExistsSync.mockRestore();
    });

    it('returns true when /.dockerenv exists', () => {
      delete process.env.DOCKER_CONTAINER;
      delete process.env.container;
      delete process.env.DOCKER_HOST;
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockImplementation((path: string) => path === '/.dockerenv');
      
      expect(EnvironmentDetector.isDockerEnvironment()).toBe(true);
      
      mockExistsSync.mockRestore();
    });
  });

  describe('getEnvironmentType', () => {
    it('returns docker when in Docker environment', () => {
      process.env.DOCKER_CONTAINER = 'true';
      expect(EnvironmentDetector.getEnvironmentType()).toBe('docker');
    });

    it('returns native when not in Docker environment', () => {
      delete process.env.DOCKER_CONTAINER;
      delete process.env.container;
      delete process.env.DOCKER_HOST;
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(EnvironmentDetector.getEnvironmentType()).toBe('native');
      
      mockExistsSync.mockRestore();
    });
  });
});

describe('NativePathResolver', () => {
  let resolver: NativePathResolver;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    resolver = new NativePathResolver();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolvePath', () => {
    it('resolves absolute paths correctly', () => {
      const testPath = '/tmp/test.txt';
      expect(resolver.resolvePath(testPath)).toBe(resolve(testPath));
    });

    it('resolves relative paths correctly', () => {
      const testPath = './test.txt';
      expect(resolver.resolvePath(testPath)).toBe(resolve(testPath));
    });

    it('throws error for empty path', () => {
      expect(() => resolver.resolvePath('')).toThrow('Path cannot be empty');
    });

    it('handles tilde in paths', () => {
      const testPath = '~/test.txt';
      expect(resolver.resolvePath(testPath)).toBe(resolve(testPath));
    });
  });

  describe('getDataDirectory', () => {
    it('returns custom directory when MCP_CLIPBOARD_DATA_DIR is set', () => {
      const customDir = '/custom/data/dir';
      process.env.MCP_CLIPBOARD_DATA_DIR = customDir;
      
      expect(resolver.getDataDirectory()).toBe(resolve(customDir));
    });

    it('returns default directory when no custom directory set', () => {
      delete process.env.MCP_CLIPBOARD_DATA_DIR;
      
      const expectedDir = join(homedir(), '.mcp-clipboard');
      expect(resolver.getDataDirectory()).toBe(expectedDir);
    });
  });
});

describe('DockerPathResolver', () => {
  let resolver: DockerPathResolver;

  beforeEach(() => {
    resolver = new DockerPathResolver('/host/home', '/host/pwd');
  });

  describe('resolvePath', () => {
    it('throws error for empty path', () => {
      expect(() => resolver.resolvePath('')).toThrow('Path cannot be empty');
    });

    it('maps home directory paths correctly', () => {
      // Use dynamic home directory
      const homeDir = homedir();
      const testResolver = new DockerPathResolver('/host/home', '/host/pwd', homeDir, process.cwd());
      const relativePath = 'documents/test.txt';
      const homePath = join(homeDir, relativePath);
      const expectedContainerPath = join('/host/home', relativePath);
      
      // Mock existsSync to return true for the expected container path  
      const mockExistsSync = spyOn(fs, 'existsSync').mockImplementation((path: string) => path === expectedContainerPath);
      
      expect(testResolver.resolvePath(homePath)).toBe(expectedContainerPath);
      
      mockExistsSync.mockRestore();
    });

    it('maps working directory paths correctly', () => {
      const currentDir = process.cwd();
      const homeDir = homedir();
      const testResolver = new DockerPathResolver('/host/home', '/host/pwd', homeDir, currentDir);
      const relativePath = 'test.txt';
      const workingPath = join(currentDir, relativePath);
      const expectedContainerPath = join('/host/pwd', relativePath);
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockImplementation((path: string) => path === expectedContainerPath);
      
      expect(testResolver.resolvePath(workingPath)).toBe(expectedContainerPath);
      
      mockExistsSync.mockRestore();
    });

    it('throws error for unmappable paths', () => {
      const unmappablePath = '/some/other/path/test.txt';
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(() => resolver.resolvePath(unmappablePath)).toThrow(
        'Cannot access file'
      );
      
      mockExistsSync.mockRestore();
    });

    it('throws error when mapped file does not exist in container', () => {
      const homeDir = homedir();
      const homePath = join(homeDir, 'nonexistent.txt');
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(() => resolver.resolvePath(homePath)).toThrow(
        'Cannot access file'
      );
      
      mockExistsSync.mockRestore();
    });

    it('prefers home directory mapping over working directory', () => {
      const homeDir = homedir();
      const currentDir = process.cwd();
      const testResolver = new DockerPathResolver('/host/home', '/host/pwd', homeDir, currentDir);
      const relativePath = 'test.txt';
      const overlapPath = join(homeDir, relativePath);
      const homeContainerPath = join('/host/home', relativePath);
      
      const mockExistsSync = spyOn(fs, 'existsSync').mockImplementation((path: string) => path === homeContainerPath);
      
      expect(testResolver.resolvePath(overlapPath)).toBe(homeContainerPath);
      
      mockExistsSync.mockRestore();
    });
  });

  describe('getDataDirectory', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns custom directory when MCP_CLIPBOARD_DATA_DIR is set', () => {
      const customDir = '/custom/docker/data';
      process.env.MCP_CLIPBOARD_DATA_DIR = customDir;
      
      expect(resolver.getDataDirectory()).toBe(customDir);
    });

    it('returns default Docker directory when no custom directory set', () => {
      delete process.env.MCP_CLIPBOARD_DATA_DIR;
      
      expect(resolver.getDataDirectory()).toBe('/app/data');
    });
  });
});

describe('PathResolverFactory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates DockerPathResolver in Docker environment', () => {
    process.env.DOCKER_CONTAINER = 'true';
    
    const resolver = PathResolverFactory.create();
    expect(resolver).toBeInstanceOf(DockerPathResolver);
  });

  it('creates NativePathResolver in native environment', () => {
    delete process.env.DOCKER_CONTAINER;
    delete process.env.container;
    delete process.env.DOCKER_HOST;
    
    const mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);
    
    const resolver = PathResolverFactory.create();
    expect(resolver).toBeInstanceOf(NativePathResolver);
    
    mockExistsSync.mockRestore();
  });
});

describe('Integration Tests', () => {
  describe('Cross-platform path handling', () => {
    it('handles Windows-style paths on Unix systems', () => {
      const resolver = new NativePathResolver();
      const windowsPath = 'C:\\Users\\test\\file.txt';
      
      // Should not throw, though the resolved path will be Unix-style
      expect(() => resolver.resolvePath(windowsPath)).not.toThrow();
    });

    it('handles Unix-style paths consistently', () => {
      const resolver = new NativePathResolver();
      const unixPath = '/home/user/file.txt';
      
      expect(resolver.resolvePath(unixPath)).toBe(resolve(unixPath));
    });
  });

  describe('Error handling consistency', () => {
    it('provides meaningful error messages across resolvers', () => {
      const nativeResolver = new NativePathResolver();
      const dockerResolver = new DockerPathResolver();
      
      expect(() => nativeResolver.resolvePath('')).toThrow('Path cannot be empty');
      expect(() => dockerResolver.resolvePath('')).toThrow('Path cannot be empty');
    });
  });
});