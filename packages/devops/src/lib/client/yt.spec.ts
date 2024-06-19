import { fetchYoutubeTitle, extractYoutubeLink } from './yt';
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
      const url = 'https://www.youtube.com/watch?v=invalidVideoId';
      const title = await fetchYoutubeTitle(url);
      expect(title).toBeNull();
    });
  });


  describe('extractYoutubeLink', () => {
    it('should return the first YouTube link found in the message', () => {
      const message = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ and this one too!';
      const link = extractYoutubeLink(message);
      expect(link).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  
    it('should return null if no YouTube link is found in the message', () => {
      const message = 'This is a message with no YouTube link.';
      const link = extractYoutubeLink(message);
      expect(link).toBeNull();
    });
  
    it('should return the first YouTube link found in the message even with multiple links', () => {
      const message = 'Here are two videos: https://www.youtube.com/watch?v=dQw4w9WgXcQ and https://youtu.be/3JZ_D3ELwOQ';
      const link = extractYoutubeLink(message);
      expect(link).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });