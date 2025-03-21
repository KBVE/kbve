#!/bin/bash

# Total requests
ITERATIONS=20000
JOBS=8 # Number of concurrent workers

# Check for GNU Parallel
if ! command -v parallel &> /dev/null; then
  echo "❌ 'parallel' is not installed."
  echo "➡️  Visit the KBVE guide for installation:"
  echo "   https://kbve.com/application/nmap/#install-parallel"

  # Try to open it in default browser
  if command -v xdg-open &> /dev/null; then
    xdg-open "https://kbve.com/application/nmap/#install-parallel"
  elif command -v open &> /dev/null; then
    open "https://kbve.com/application/nmap/#install-parallel"  # macOS
  else
    echo "📎 Please open the link manually."
  fi

  exit 1
fi

post_random_kv() {
  local length=$((8 + RANDOM % 8))
  local key=$(LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c $length)
  local payload='{"value": "no seriously if i dont get a coconut for my dog i will cry for real seriously dont mess with me i will fuck you up i know karate and if you think im lying i can show you my black belt because its totally legit and even though it says pornhub on it with the logo and everything thats something i put on there myself with an iron and not because of any videos you might see of me online anywhere or anything like that i mean who even makes money from pornhub thats not even a real thing and i really need you to stop looking at me like that because ive got a weird thing where if someone is looking at me like theyre questioning my entire existence then i get super anxious and no really what are you doing stepbro get out of my room i really need you to step away and - uh! - did you just put your dick in me this is not kosher and i will be telling mom about this when we get back from spring break"}'

  curl -s -X POST "http://127.0.0.1:3000/store/$key" \
       -H "Content-Type: application/json" \
       -d "$payload" > /dev/null
  
  echo "Stored key: $key"
}

export -f post_random_kv

seq "$ITERATIONS" | parallel --eta -j "$JOBS" post_random_kv

echo "Completed $ITERATIONS parallel requests with $JOBS workers."
