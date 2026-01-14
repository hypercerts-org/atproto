import { OAuthClientMetadata } from '@atproto/oauth-types'
import { extractHue, pickContrastColor } from '../lib/util/color.js'
import { Branding } from './branding.js'
import { COLOR_NAMES } from './colors.js'
import { Customization } from './customization.js'

export function buildCustomizationCss({
  branding,
  clientMetadata,
  isTrusted,
}: Customization & {
  clientMetadata?: OAuthClientMetadata
  isTrusted?: boolean
}): undefined | string {
  // Build CSS variables from PDS branding
  const vars = Array.from(buildCustomizationVars(branding))

  // Get arbitrary CSS from trusted clients only
  const customCss =
    isTrusted && clientMetadata?.branding?.css
      ? clientMetadata.branding.css
      : undefined

  // Build the final CSS string
  const cssParts: string[] = []

  if (vars.length) {
    cssParts.push(`:root { ${vars.join(' ')} }`)
  }

  if (customCss) {
    cssParts.push(customCss)
  }

  return cssParts.length > 0 ? cssParts.join('\n') : undefined
}

function* buildCustomizationVars(branding?: Branding): Generator<string> {
  if (branding?.colors) {
    const contrastLight = branding.colors.light ?? { r: 255, g: 255, b: 255 }
    const contrastDark = branding.colors.dark ?? { r: 0, g: 0, b: 0 }

    for (const name of COLOR_NAMES) {
      const value = branding.colors[name]
      if (!value) continue // Skip missing colors

      const contrast =
        branding.colors[`${name}Contrast`] ??
        pickContrastColor(value, contrastLight, contrastDark)

      const hue = branding.colors[`${name}Hue`] ?? extractHue(value)

      yield `--branding-color-${name}: ${value.r} ${value.g} ${value.b};`
      yield `--branding-color-${name}-contrast: ${contrast.r} ${contrast.g} ${contrast.b};`
      yield `--branding-color-${name}-hue: ${hue};`
    }
  }
}
