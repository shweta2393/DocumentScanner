# Troubleshooting Guide

## OpenAI API Quota Exceeded Error

If you see the error: **"You exceeded your current quota, please check your plan and billing details"**

This means your OpenAI API key has run out of credits. Here's how to fix it:

### Option 1: Add Credits to Your OpenAI Account

1. Go to https://platform.openai.com/account/billing
2. Sign in with your OpenAI account
3. Add payment method and purchase credits
4. The app will automatically use the new credits

### Option 2: Use a Different API Key

1. Get a new API key from https://platform.openai.com/api-keys
2. Update your `.env` file:
   ```
   EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-your-new-key-here
   ```
3. Restart Expo: `npx expo start -c`

### Option 3: Check Your Usage

Visit https://platform.openai.com/usage to see:
- Current balance
- Usage history
- Billing settings

## Other Common Errors

### "OpenAI API key not set"
- Make sure `.env` file exists in the project root
- Check that `EXPO_PUBLIC_OPENAI_API_KEY` is set correctly
- Restart Expo with `npx expo start -c` after changing `.env`

### "Invalid API Key"
- Verify your API key at https://platform.openai.com/api-keys
- Make sure you copied the full key (starts with `sk-proj-`)
- Check for extra spaces or line breaks

### "Rate Limit Exceeded"
- You're making too many requests too quickly
- Wait a few seconds and try again
- Check your rate limits at https://platform.openai.com/account/limits

## Cost Management Tips

1. **Use gpt-4o-mini**: Already configured - cheaper than gpt-4o
2. **Monitor Usage**: Check https://platform.openai.com/usage regularly
3. **Set Limits**: Configure spending limits at https://platform.openai.com/account/limits
