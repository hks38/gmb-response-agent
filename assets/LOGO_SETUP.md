# Logo Setup Instructions

To use the Malama Dental logo in generated GMB post images, please follow these steps:

## Option 1: Place Logo File in Assets Folder

1. Save your Malama Dental logo file as one of these names:
   - `logo.png` (recommended - supports transparency)
   - `logo.jpg`

2. Place the file in one of these locations:
   - `/assets/logo.png` (recommended)
   - `/data/logo.png`
   - `/public/logo.png`
   - `/logo.png` (root directory)

The system will automatically find and use the logo file.

## Option 2: Provide Logo URL

If you prefer to host the logo online, you can update the `imageGenerator.ts` file to use a URL instead:

```typescript
const LOGO_URL = 'https://your-domain.com/logo.png';
```

## Logo Specifications

- **Recommended size**: At least 300x300 pixels (will be resized to 150x150 in final image)
- **Format**: PNG with transparency (recommended) or JPG
- **Background**: Transparent or white background works best
- **Position**: Logo will be placed in the top-right corner with padding

## Current Logo Description

Based on the provided image description, the Malama Dental logo features:
- A stylized tooth and hibiscus flower icon
- Business name: "MĀIAMA DENTAL" (note the macron accent over the first 'A')
- Colors: Muted pink/beige (#E0C9C2), rose pink (#B27F8B), teal/grey-green (#5C7373)
- Style: Clean, elegant, professional

If you have the actual logo file, place it in `/assets/logo.png` and the image generator will automatically use it.


