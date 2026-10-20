
import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

interface HostCredentialFile {
  token: string;
  createdAt: string;
}

class HostAuthService {
  private token: string | null = null;
  private initializationPromise: Promise<void> | null = null;

  private get credentialPath(): string {
    return path.join(config.storageDir, 'host-auth.json');
  }

  async ready(): Promise<void> {
    if (this.token) return;

    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }

    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    await mkdir(config.storageDir, { recursive: true });

    try {
      const contents = await readFile(this.credentialPath, 'utf8');
      const parsed: unknown = JSON.parse(contents);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('token' in parsed) ||
        typeof parsed.token !== 'string' ||
        parsed.token.length < 64
      ) {
        throw new Error(
          'The host credential file is invalid. Back it up and repair it before restarting AirBridge.'
        );
      }

      this.token = parsed.token;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const credential: HostCredentialFile = {
      token: randomBytes(48).toString('hex'),
      createdAt: new Date().toISOString(),
    };

    const temporaryPath = `${this.credentialPath}.${process.pid}.tmp`;

    await writeFile(
      temporaryPath,
      JSON.stringify(credential, null, 2),
      {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      }
    );

    try {
      await rename(temporaryPath, this.credentialPath);
      this.token = credential.token;
    } catch (error) {
      // If another startup process created the file first, reuse it.
      try {
        const contents = await readFile(this.credentialPath, 'utf8');
        const existing: unknown = JSON.parse(contents);

        if (
          typeof existing !== 'object' ||
          existing === null ||
          !('token' in existing) ||
          typeof existing.token !== 'string' ||
          existing.token.length < 64
        ) {
          throw new Error('The existing host credential file is invalid.');
        }

        this.token = existing.token;
      } catch {
        throw error;
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  getToken(): string {
    if (!this.token) {
      throw new Error(
        'Host authentication has not been initialized. Initialize it before accepting requests.'
      );
    }

    return this.token;
  }
}

export const hostAuthService = new HostAuthService();
