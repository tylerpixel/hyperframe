#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == /var/www/hyperframe/* ]]; then
  pm2 restart hyperframe --silent
fi
