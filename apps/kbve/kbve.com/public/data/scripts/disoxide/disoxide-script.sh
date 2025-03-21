#!/bin/bash

# Number of times to execute the curl command
ITERATIONS=20000

# Function to generate a random string for the store ID
generate_random_id() {
  # Generate a random string of alphanumeric characters
  local length=$((8 + RANDOM % 8))  # Random length between 8 and 15 characters
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
}

# The payload data
PAYLOAD='{"value": "no seriously if i dont get a coconut for my dog i will cry for real seriously dont mess with me i will fuck you up i know karate and if you think im lying i can show you my black belt because its totally legit and even though it says pornhub on it with the logo and everything thats something i put on there myself with an iron and not because of any videos you might see of me online anywhere or anything like that i mean who even makes money from pornhub thats not even a real thing and i really need you to stop looking at me like that because ive got a weird thing where if someone is looking at me like theyre questioning my entire existence then i get super anxious and no really what are you doing stepbro get out of my room i really need you to step away and - uh! - did you just put your dick in me this is not kosher and i will be telling mom about this when we get back from spring break"}'

# Execute the curl command in a loop
for ((i=1; i<=ITERATIONS; i++)); do
  # Generate a random store ID
  STORE_ID=$(generate_random_id)

  # Execute the curl command with the random store ID
  curl -X POST "http://127.0.0.1:3000/store/$STORE_ID" \
       -H "Content-Type: application/json" \
       -d "$PAYLOAD" \
       -s > /dev/null  # Silent mode, discard output

  # Print progress every 100 iterations
  if [ $((i % 100)) -eq 0 ]; then
    echo "Completed $i/$ITERATIONS requests"
  fi
done

echo "All $ITERATIONS requests completed!"
