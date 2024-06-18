import { fetchYoutubeTitle } from './yt';
describe('fetchYoutubeTitle', () => {
    it('should return the title of the YouTube video', async () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; 
      const title = await fetchYoutubeTitle(url);
      expect(title).toBe('Rick Astley - Never Gonna Give You Up (Official Music Video)'); 
    });
  
    it('should return null for an invalid YouTube URL', async () => {
      const url = 'https://www.invalidurl.com';
      const title = await fetchYoutubeTitle(url);
      expect(title).toBeNull();
    });
  
    it('should return null if the title is not found', async () => {
      const url = 'https://www.youtube.com/watch?v=invalidVideoId'; // Replace with a URL that you know doesn't exist or doesn't have a title meta tag
      const title = await fetchYoutubeTitle(url);
      console.log(title);
      expect(title).toBeNull();
    });
  });