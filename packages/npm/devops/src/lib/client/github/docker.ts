import { promisify } from 'util';
import { exec } from 'child_process';
import {
  sanitizePort,
  sanitizeContainerName,
  sanitizeContainerImage,
} from '../../sanitization';
import { GitHubClient, GitHubContext } from './types';
import { _$gha_createIssueComment } from './issues';

const execAsync = promisify(exec);

export async function _$gha_runDockerContainer(
  github: GitHubClient,
  context: GitHubContext,
  port: number,
  name: string,
  image: string,
): Promise<void> {
  let sanitizedPort: number;
  let sanitizedName: string;
  let sanitizedImage: string;

  try {
    sanitizedPort = sanitizePort(port);
    sanitizedName = sanitizeContainerName(name);
    sanitizedImage = sanitizeContainerImage(image);
  } catch (error) {
    console.error('Error sanitizing input:', error);
    throw error;
  }

  const command = `docker run -d -p ${sanitizedPort}:${sanitizedPort} --name ${sanitizedName} ${sanitizedImage}`;

  try {
    const { stdout } = await execAsync(command);
    console.log('Docker container started successfully:', stdout);
    await _$gha_createIssueComment(
      github,
      context,
      `Docker container started successfully: ${stdout}`,
    );
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : String(error);
    console.error('Error running Docker container:', error);
    await _$gha_createIssueComment(
      github,
      context,
      `Error running Docker container: ${errMessage}`,
    );
    throw error;
  }
}

export async function _$gha_stopDockerContainer(
  github: GitHubClient,
  context: GitHubContext,
  name: string,
): Promise<void> {
  let sanitizedName: string;

  try {
    sanitizedName = sanitizeContainerName(name);
  } catch (error) {
    console.error('Error sanitizing container name:', error);
    throw error;
  }

  try {
    const { stdout: stopStdout } = await execAsync(
      `docker stop ${sanitizedName}`,
    );
    console.log('Docker container stopped successfully:', stopStdout);
    await _$gha_createIssueComment(
      github,
      context,
      `Docker container stopped successfully: ${stopStdout}`,
    );
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : String(error);
    console.error('Error stopping Docker container:', error);
    await _$gha_createIssueComment(
      github,
      context,
      `Error stopping Docker container: ${errMessage}`,
    );
    throw error;
  }

  try {
    const { stdout: removeStdout } = await execAsync(
      `docker rm ${sanitizedName}`,
    );
    console.log('Docker container removed successfully:', removeStdout);
    await _$gha_createIssueComment(
      github,
      context,
      `Docker container removed successfully: ${removeStdout}`,
    );
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : String(error);
    console.error('Error removing Docker container:', error);
    await _$gha_createIssueComment(
      github,
      context,
      `Error removing Docker container: ${errMessage}`,
    );
    throw error;
  }
}
