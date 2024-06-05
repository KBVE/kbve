#!/bin/bash

# Function to escape markdown special characters
escape_markdown() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/\*/\\*/g' -e 's/_/\\_/g' -e 's/|/\\|/g' -e 's/\[/\\[/g' -e 's/\]/\\]/g' -e 's/(/\\(/g' -e 's/)/\\)/g' -e 's/#/\\#/g' -e 's/+/\\+/g' -e 's/-/\\-/g' -e 's/!/\\!/g' -e 's/\./\\./g'
}

# Check for correct number of arguments
if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <filename without extension> <youtube_tag> <track_title>"
  exit 1
fi

# Variables
file_name="$1"
youtube_tag="$2"
track_title="$3"
input_file="/apps/kbve.com/src/content/docs/music/${file_name}.mdx"

# Check if the file exists
if [ ! -f "$input_file" ]; then
  echo "File $input_file does not exist."
  exit 1
fi

# Escape markdown special characters in youtube_tag and track_title
escaped_youtube_tag=$(escape_markdown "$youtube_tag")
escaped_track_title=$(escape_markdown "$track_title")

# Check if the YouTube tag already exists in yt-tracks
if grep -q "  - $escaped_youtube_tag" "$input_file"; then
  echo "The YouTube tag $youtube_tag already exists in yt-tracks. No changes made."
  exit 0
fi

# Extract existing yt-tracks
yt_tracks=$(awk '/yt-tracks:/,/yt-sets:/' "$input_file" | grep -v "yt-tracks:" | grep -v "yt-sets:")

# Append the new YouTube tag to the yt-tracks section
yt_tracks="$yt_tracks\n  - $escaped_youtube_tag"

# Extract the content of the markdown file before and after the yt-tracks section
before_yt_tracks=$(awk '/yt-tracks:/ {print; exit}' "$input_file")
after_yt_tracks=$(awk '/yt-sets:/,0' "$input_file")

# Extract the content of the markdown file before and after the TrackList table
before_tracklist=$(awk '/## TrackList/ {print; exit}' "$input_file")
after_tracklist=$(awk '/## SetList/,0' "$input_file")

# Extract the existing TrackList table content
tracklist_table=$(awk '/## TrackList/,/## SetList/' "$input_file")

# Add the new track entry to the TrackList table
new_track_entry="| $escaped_track_title | $escaped_youtube_tag | [Play Track ID $escaped_youtube_tag](https://kbve.com/music/?yt=$escaped_youtube_tag) |"
tracklist_table=$(echo -e "$tracklist_table\n$new_track_entry")

# Create the updated content
updated_content="$before_yt_tracks\nyt-tracks:\n$yt_tracks\n$after_yt_tracks"
updated_content=$(echo -e "$updated_content\n$before_tracklist\n## TrackList\n$tracklist_table\n$after_tracklist")

# Write the updated content back to the file
echo -e "$updated_content" > "$input_file"

echo "YouTube tag and track title have been added successfully."
