#!/bin/bash

# Function to escape markdown special characters
escape_markdown() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/\*/\\*/g' -e 's/_/\\_/g' -e 's/|/\\|/g' -e 's/\[/\\[/g' -e 's/\]/\\]/g' -e 's/(/\\(/g' -e 's/)/\\)/g' -e 's/#/\\#/g' -e 's/+/\\+/g' -e 's/-/\\-/g' -e 's/!/\\!/g' -e 's/\./\\./g'
}

# Function to display usage
usage() {
  echo "Usage: $0 file=<filename without extension> ytid=<youtube_tag> title=<track_title>"
  exit 1
}

# Parse arguments
for arg in "$@"; do
  case $arg in
    file=*)
      file_name="${arg#*=}"
      shift
      ;;
    ytid=*)
      youtube_tag="${arg#*=}"
      shift
      ;;
    title=*)
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
after_yt_tracks=$(awk '/yt-sets:/,0' "$input
