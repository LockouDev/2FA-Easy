# 2FA Easy

2FA Easy is a simple Windows app that keeps your TOTP codes in one place

Add your accounts, see the current code, copy it with one click and keep moving without opening your phone every time

## Use 2FAS Auth

2FA Easy needs the secret key behind a TOTP account

We recommend using [2FAS Auth](https://2fas.com/auth/) because it lets you view the Secret Key for a saved service from its edit screen

## Add an account

1. Install 2FAS Auth on your phone and add the service normally
2. Open the service inside 2FAS Auth and enter its edit screen
3. Tap the eye icon next to the Secret Key to reveal it
4. Copy the Secret Key
5. Open 2FA Easy and select `New account`
6. Enter a visible name, service, account label and the Secret Key
7. Save the account and use `Copy code` whenever you need a fresh TOTP code

The exact names can look a little different between Android and iOS versions of 2FAS Auth

## Keep your secret safe

Your Secret Key can generate the same 2FA codes as your phone

Never share it, never post it in screenshots and never commit it to GitHub

2FA Easy stores accounts locally on the Windows profile that added them

## TOTP support

The current app supports the most common TOTP setup

- SHA-1
- 6 digits
- 30 second refresh time

## Install

Download the latest Windows installer from the [Releases](../../releases) page when a release is available

## Important

2FA Easy is an independent project and is not affiliated with 2FAS
