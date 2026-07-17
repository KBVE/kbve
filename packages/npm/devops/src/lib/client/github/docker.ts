import { promisify } from 'util';
import { execFile } from 'child_process';
import {
	sanitizePort,
	sanitizeContainerName,
	sanitizeContainerImage,
} from '../../sanitization';
import { GitHubClient, GitHubContext } from './types';
import { issues } from './issues';

const execFileAsync = promisify(execFile);

async function runContainer(
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

	try {
		const { stdout } = await execFileAsync('docker', [
			'run',
			'-d',
			'-p',
			`${sanitizedPort}:${sanitizedPort}`,
			'--name',
			sanitizedName,
			sanitizedImage,
		]);
		console.log('Docker container started successfully:', stdout);
		await issues.createComment(
			github,
			context,
			`Docker container started successfully: ${stdout}`,
		);
	} catch (error) {
		const errMessage =
			error instanceof Error ? error.message : String(error);
		console.error('Error running Docker container:', error);
		await issues.createComment(
			github,
			context,
			`Error running Docker container: ${errMessage}`,
		);
		throw error;
	}
}

async function stopContainer(
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
		const { stdout: stopStdout } = await execFileAsync('docker', [
			'stop',
			sanitizedName,
		]);
		console.log('Docker container stopped successfully:', stopStdout);
		await issues.createComment(
			github,
			context,
			`Docker container stopped successfully: ${stopStdout}`,
		);
	} catch (error) {
		const errMessage =
			error instanceof Error ? error.message : String(error);
		console.error('Error stopping Docker container:', error);
		await issues.createComment(
			github,
			context,
			`Error stopping Docker container: ${errMessage}`,
		);
		throw error;
	}

	try {
		const { stdout: removeStdout } = await execFileAsync('docker', [
			'rm',
			sanitizedName,
		]);
		console.log('Docker container removed successfully:', removeStdout);
		await issues.createComment(
			github,
			context,
			`Docker container removed successfully: ${removeStdout}`,
		);
	} catch (error) {
		const errMessage =
			error instanceof Error ? error.message : String(error);
		console.error('Error removing Docker container:', error);
		await issues.createComment(
			github,
			context,
			`Error removing Docker container: ${errMessage}`,
		);
		throw error;
	}
}

export const docker = {
	runContainer,
	stopContainer,
};
