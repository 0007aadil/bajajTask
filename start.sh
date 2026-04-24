#!/bin/bash
# Start the server with Gmail email support
# Replace the password below with your actual Gmail App Password
# Get one at: https://myaccount.google.com/apppasswords

export GMAIL_APP_PASSWORD="PASTE_YOUR_APP_PASSWORD_HERE"

kill -9 $(lsof -ti:3000) 2>/dev/null
sleep 1
node server.js
