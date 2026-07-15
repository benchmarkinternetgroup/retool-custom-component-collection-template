export type CustomFontDefinition = {
  label: string
  value: string
  // Optional: only web fonts need a stylesheet URL. Japanese system fonts
  // (Meiryo, Yu Gothic, Hiragino, etc.) are installed locally and omit it.
  url?: string
}

export const CUSTOM_FONTS: CustomFontDefinition[] = [
  {
    label: 'Poppins',
    value: "'Poppins', Arial, sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap'
  },
  {
    label: 'Roboto',
    value: "'Roboto', Helvetica, sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap'
  },
  {
    label: 'Nunito',
    value: "'Nunito', Arial, sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap'
  },
  {
    label: 'Meiryo',
    value: "'Meiryo', 'Yu Gothic', 'Hiragino Kaku Gothic Pro', sans-serif;"
  },
  {
    label: 'Yu Gothic',
    value:
      "'YuGothic', 'Yu Gothic', 'Yu Gothic Medium', Meiryo, 'Hiragino Kaku Gothic Pro', sans-serif;"
  },
  {
    label: 'Hiragino Kaku Gothic Pro',
    value: "'Hiragino Kaku Gothic Pro', 'Yu Gothic', Meiryo, sans-serif;"
  },
  {
    label: 'Biz UDGothic',
    value: "'BIZ UDGothic', Meiryo, 'Yu Gothic', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap'
  },
  {
    label: 'Zen Old Mincho',
    value:
      "'Zen Old Mincho', YuGothic, Meiryo, 'Hiragino Kaku Gothic Pro', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;700&display=swap'
  },
  {
    label: 'Noto Sans Japanese',
    value: "'Noto Sans JP', Meiryo, 'Yu Gothic', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap'
  },
  {
    label: 'Noto Serif JP',
    value: "'Noto Serif JP', 'Hiragino Mincho Pro', serif;",
    url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap'
  },
  {
    label: 'Hiragino Mincho',
    value: "'Hiragino Mincho', serif;"
  },
  {
    label: 'Yu Mincho',
    value: "'Yu Mincho', serif;"
  },
  {
    label: 'Zen Maru Gothic',
    value: "'Zen Maru Gothic', Meiryo, 'Hiragino Kaku Gothic Pro', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700&display=swap'
  },
  {
    label: 'Zen Kurenaido',
    value: "'Zen Kurenaido', 'Hiragino Kaku Gothic Pro', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Zen+Kurenaido:wght@400;700&display=swap'
  },
  {
    label: 'Inter',
    value: "'Inter', Arial, sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'
  },
  {
    label: 'Zen Kaku Gothic New',
    value:
      "'Zen Kaku Gothic New', Meiryo, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;",
    url: 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap'
  },
  {
    label: 'Shippori Mincho',
    value: "'Shippori Mincho', 'Yu Mincho', 'Hiragino Mincho ProN', serif;",
    url: 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;700&display=swap'
  }
]
