const inAppBrowserUserAgent =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Telegram|WhatsApp|;\s*wv\)/i;

export function isInAppBrowser(userAgent: string): boolean {
  return inAppBrowserUserAgent.test(userAgent);
}
