# Issues & TODO

## Open Issues

### #1 - Subtitle fetch blocked by adblockers (CRITICAL)
**Status**: Known Issue  
**Severity**: High - Extension will not work without fix

**Description**: Adblockers like uBlock Origin, AdGuard, etc. interfere with YouTube's timedtext API, causing subtitle extraction to fail with "Empty subtitle response" or "No subtitle content found".

**Symptoms**:
- Status shows "Failed to load subtitles"
- Console shows: `[VideoTranslate] Empty response, trying next URL`
- All subtitle fetch attempts return empty responses

**Solution - Add uBlock Exception**:

1. Click the **uBlock Origin icon** in your Chrome toolbar
2. Click the **⚙️ Dashboard** (gear icon)
3. Go to the **"My filters"** tab
4. Add this line:
   ```
   @@||youtube.com/api/timedtext$xhr,domain=youtube.com
   ```
5. Click **"Apply changes"**
6. **Refresh the YouTube page**

**Alternative Solutions**:
- Temporarily disable uBlock Origin for youtube.com
- Use a browser profile without adblockers
- Add exception in other adblockers (AdGuard: similar filter syntax)

**Technical Details**:
The timedtext API (`youtube.com/api/timedtext`) is where YouTube serves subtitle/caption data. Some adblocker filter lists classify this as a tracking endpoint and block or modify the response.

---

## Planned Features

- [ ] Alternative subtitle extraction that doesn't require API calls
- [ ] Better detection of adblocker interference
- [ ] User-friendly error messages with solution links

---

## Completed

_No completed issues yet_

## Notes

- Track bugs and feature requests here
- Reference commit hashes when resolving issues
