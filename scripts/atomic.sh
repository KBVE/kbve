#!/bin/sh
set -e

#   Switch to Dev Branch
git switch dev

#   Git Pull
git pull

#   Checkout Origin Dev Branch
#git checkout origin/dev

#   Switch to Atomic Patch Branch

git_date=$(date +'%m-%d-%Y-%s')

if [ "$#" -eq  "0" ]
   then
     patch_name = "patch-atomic-${git_date}"
 else
     unformatPatch = "${0}"
     newPatch = "${unformatPatch//[^[:alnum:]]/-}"
     patch_name = "patch-atomic-${newPatch}-${git_date}"
 fi


git switch -c "${patch_name}"

#   git switch -c "patch-atlas-${git_date}"