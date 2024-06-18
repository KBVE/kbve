import axios from 'axios';
import { JSDOM } from 'jsdom';

/**
 * Regular expression to validate YouTube URLs.
 */
const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;

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
