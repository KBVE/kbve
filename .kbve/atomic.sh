#!/bin/sh
set -e

#   Git Pull
git pull

#   Checkout Origin Dev Branch
git checkout origin/dev

#   Switch to Dev Branch
git switch dev

#   Switch to Atomic Patch Branch

git_date=$(date +'%m-%d-%Y-%s')
git switch -c "patch-atomic-${git_date}"

#   git switch -c "patch-atlas-${git_date}"