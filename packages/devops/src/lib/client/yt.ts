import axios from 'axios';
import { JSDOM } from 'jsdom';

/**
 * Regular expression to validate YouTube URLs.
 */
const YOUTUBE_URL_REGEX =
  //  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/g;

/**
 * Fetches the title of a YouTube video without using the YouTube API.
 * @param url - The URL of the YouTube video.
 * @returns The title of the YouTube video.
 */
export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  // Validate the YouTube URL
  if (!YOUTUBE_URL_REGEX.test(url)) {
    console.error('Invalid YouTube URL');
    return null;
  }

  try {
    const response = await axios.get(url);
    const dom = new JSDOM(response.data);

    const videoElement = dom.window.document.querySelector(
      'meta[property="og:video:url"]',
    );

    // Check if the meta tag for the video is present
    if (!videoElement) {
      console.error('No valid video found on the page');
      return null;
    }

    const titleElement =
      dom.window.document.querySelector('meta[name="title"]') ||
      dom.window.document.querySelector('meta[property="og:title"]') ||
      dom.window.document.querySelector('title');

    if (titleElement) {
      return titleElement.getAttribute('content') || titleElement.textContent;
    }
    return null;
  } catch (error) {
    console.error('Error fetching YouTube title:', error);
    return null;
  }
}

/**
 * Extracts the first YouTube link found in a given message.
 * @param message - The message string to search through.
 * @returns The first YouTube link found in the message, or null if no link is found.
 */
export function extractYoutubeLink(message: string): string | null {
  const urlMatches = message.match(YOUTUBE_URL_REGEX);
  return urlMatches ? urlMatches[0] : null;
}

/**
 * Extracts the YouTube video ID from a given message.
 * @param message - The message string to search through.
 * @returns The YouTube video ID found in the message, or null if no valid ID is found.
 */
export function extractYoutubeId(message: string): string | null {
  const url = extractYoutubeLink(message);
  if (!url) {
    return null;
  }

  const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
  return videoIdMatch ? videoIdMatch[1] : null;
}
