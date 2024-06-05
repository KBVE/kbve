#!/bin/bash

# Function to display usage
usage() {
  echo "Usage: $0 --file=<filename without extension> --ytid=<youtube_tag> --title=<track_title>"
  exit 1
}

# Function to update yt-tracks in the frontmatter
update_frontmatter() {
  local input_file="$1"
  local youtube_tag="$2"

  # Read the entire file into a variable
  file_content=$(cat "$input_file")

  # Extract sections before yt-tracks, yt-tracks, and after yt-tracks
  before_yt_tracks=$(echo "$file_content" | awk '/yt-tracks:/ {exit} {print}')
  yt_tracks=$(echo "$file_content" | awk '/yt-tracks:/,/yt-sets:/ {print}' | grep -v "yt-tracks:" | grep -v "yt-sets:")
  after_yt_tracks=$(echo "$file_content" | awk '/yt-sets:/, 0 {print}')

  # Check if the YouTube tag already exists in yt-tracks
  if echo "$yt_tracks" | grep -q "  - $youtube_tag"; then
    echo "The YouTube tag $youtube_tag already exists in yt-tracks. No changes made."
    return 0
  fi

  # Append the new YouTube tag to the yt-tracks section
  yt_tracks="$yt_tracks\n  - $youtube_tag"

  # Create the updated content
  updated_content="$before_yt_tracks\nyt-tracks:\n$yt_tracks\n$after_yt_tracks"

  # Write the updated content back to the file
  echo -e "$updated_content" > "$input_file"

  echo "YouTube tag has been added to the frontmatter successfully."
}

# Function to escape markdown special characters
escape_markdown() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/\*/\\*/g' -e 's/_/\\_/g' -e 's/|/\\|/g' -e 's/\[/\\[/g' -e 's/\]/\\]/g' -e 's/(/\\(/g' -e 's/)/\\)/g' -e 's/#/\\#/g' -e 's/+/\\+/g' -e 's/-/\\-/g' -e 's/!/\\!/g' -e 's/\./\\./g'
}

# Function to update the TrackList section
update_tracklist() {
  local input_file="$1"
  local youtube_tag="$2"
  local track_title="$3"

  # Escape markdown special characters in the track title
  escaped_track_title=$(escape_markdown "$track_title")

  # Read the entire file into a variable
  file_content=$(cat "$input_file")

  # Extract sections before TrackList, TrackList, and after TrackList
  before_tracklist=$(echo "$file_content" | awk '/## TrackList/ {exit} {print}')
  tracklist_table=$(echo "$file_content" | awk '/## TrackList/,/^---/ {print}' | grep -v "## TrackList" | grep -v "^---")
  after_tracklist=$(echo "$file_content" | awk '/^---/, 0 {print}')

  # Check if the YouTube tag already exists in the TrackList
  if echo "$tracklist_table" | grep -q "| $youtube_tag |"; then
    echo "The YouTube tag $youtube_tag already exists in the TrackList. No changes made."
    return 0
  fi

  # Add the new track entry to the TrackList table
  new_track_entry="| $escaped_track_title | $youtube_tag | [Play Track ID $youtube_tag](https://kbve.com/music/?yt=$youtube_tag) |"
  tracklist_table=$(echo -e "$tracklist_table\n$new_track_entry")

  # Create the updated content
  updated_content="$before_tracklist\n## TrackList\n$tracklist_table\n$after_tracklist"

  # Write the updated content back to the file
  echo -e "$updated_content" > "$input_file"

  echo "YouTube tag and track title have been added to the TrackList successfully."
}


# Parse arguments
for arg in "$@"; do
  case $arg in
    --file=*)
      file_name="${arg#*=}"
      shift
      ;;
    --ytid=*)
      youtube_tag="${arg#*=}"
      shift
      ;;
    --title=*)
      track_title="${arg#*=}"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

# Check if all required arguments are provided
if [ -z "$file_name" ] || [ -z "$youtube_tag" ] || [ -z "$track_title" ]; then
  usage
fi

input_file="./apps/kbve.com/src/content/docs/music/${file_name}.mdx"

# Check if the file exists
if [ ! -f "$input_file" ]; then
  echo "File $input_file does not exist."
  exit 1
fi

# Update yt-tracks in the frontmatter
update_frontmatter "$input_file" "$youtube_tag"

# Update the TrackList section
update_tracklist "$input_file" "$youtube_tag" "$track_title"
