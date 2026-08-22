# Custom logo

Two ways to set a custom logo - pick whichever is easier:

**Upload a file**: drop a `.png` or `.svg` into this directory, then set its
filename in `.env`:

```
LOGO_FILENAME=logo.svg
```

**Or link to one hosted elsewhere**: set a full URL instead - no file needed
in this directory at all:

```
LOGO_FILENAME=https://example.com/my-logo.png
```

Restart the frontend container to pick it up:

```
docker compose up -d frontend
```

Applies to the sidebar, the login/register screens, the browser tab
favicon, and the chat assistant's icon. Leave `LOGO_FILENAME` blank (or the
file absent) to use the default Belege-Archiv logo.
