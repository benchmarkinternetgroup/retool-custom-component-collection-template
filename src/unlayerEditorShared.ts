import React, { useEffect, useRef, useState } from 'react'
import type { EditorRef, EmailEditorProps } from 'react-email-editor'
import { Retool } from '@tryretool/custom-component-support'
import { scratch } from './email-templates/scratch'
import { scratch as formScratch } from './form-templates/scratch'

export type UnlayerEditorConfig = {
  designMode?: 'edit' | 'form'
}

export const isJson = (str: string): boolean => {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

export const useUnlayerEditor = (config?: UnlayerEditorConfig) => {
  const [projectId] = Retool.useStateString({ name: 'projectId' })
  const [emailDesign, setEmailDesign] = Retool.useStateString({
    name: 'emailDesign'
  })
  const [currentDesign, setCurrentDesign] = useState('')
  const [emailHtml, setEmailHtml] = Retool.useStateString({ name: 'emailHtml' })
  const [emailImage, setEmailImage] = Retool.useStateString({
    name: 'emailImage'
  })
  const triggerSave = Retool.useEventCallback({ name: 'triggerSave' })
  const emailEditorRef = useRef<EditorRef>(null)
  const [retoolId] = Retool.useStateString({ name: 'retoolId' })

  const designMode = config?.designMode ?? 'edit'

  const saveEmail = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.exportImage((data) => {
      const { url } = data
      setEmailImage(url || '')
      unlayer?.exportHtml((data) => {
        const { design, html } = data
        setEmailDesign(JSON.stringify(design))
        setEmailHtml(html)
        setCurrentDesign(JSON.stringify(design))
        triggerSave()
      })
    })
  }

  const saveForm = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.exportImage((data) => {
      const { url } = data
      setEmailImage(url || '')
      unlayer?.exportHtml((data) => {
        const { design, html } = data
        const extractedFormCss = extractCssFromDesign(html);
        const extractedFormBodyHtml = extractBodyHtmlFromDesign(html);
        const htmlToSave =  extractedFormCss && extractedFormBodyHtml ? `<style>${extractedFormCss}</style>\n${extractedFormBodyHtml}` : html;
        setEmailDesign(JSON.stringify(design))
        setEmailHtml(htmlToSave)
        setCurrentDesign(JSON.stringify(design))
        triggerSave()
      })
    })
  }

  const extractCssFromDesign = (html: string) => {
    const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    return css ? css[1] : '';
  }

  const extractBodyHtmlFromDesign = (html: string) => {
    const bodyHtml = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    return bodyHtml ? bodyHtml[1] : '';
  }

  const loadEmailDesignFromState = () => {
    const unlayer = emailEditorRef.current?.editor
    const parsedDesign =
      emailDesign && emailDesign !== '{}' && isJson(emailDesign)
        ? JSON.parse(emailDesign)
        : JSON.parse(scratch)
    unlayer?.loadDesign(parsedDesign)
    setCurrentDesign(JSON.stringify(parsedDesign))
  }

  const loadFormDesignFromState = () => {
    const unlayer = emailEditorRef.current?.editor
    const parsedDesign =
      emailDesign && emailDesign !== '{}' && isJson(emailDesign)
        ? JSON.parse(emailDesign)
        : JSON.parse(formScratch)
    unlayer?.loadDesign(parsedDesign)
    setCurrentDesign(JSON.stringify(parsedDesign))
  }

  const onReady: EmailEditorProps['onReady'] = () => {
    loadEmailDesignFromState()
  }

  const onReadyForm: EmailEditorProps['onReady'] = () => {
    loadFormDesignFromState()
  }

  const updateDesign = () => {
    const unlayer = emailEditorRef.current?.editor
    const parsedDesign =
      currentDesign && isJson(currentDesign) ? JSON.parse(currentDesign) : null
    if (parsedDesign) {
      unlayer?.loadDesign(parsedDesign)
    }
  }

  const newDesign = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.loadDesign(JSON.parse(scratch))
    setCurrentDesign(JSON.stringify(JSON.parse(scratch)))
  }

  const newFormDesign = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.loadDesign(JSON.parse(formScratch))
    setCurrentDesign(JSON.stringify(JSON.parse(formScratch)))
  }

  useEffect(() => {
    loadEmailDesignFromState()
  }, [emailDesign])

  useEffect(() => {
    loadFormDesignFromState()
  }, [emailDesign])

  return {
    emailEditorRef,
    currentDesign,
    setCurrentDesign,
    emailHtml,
    emailImage,
    projectId,
    retoolId,
    designMode,
    saveEmail,
    saveForm,
    onReady,
    onReadyForm,
    updateDesign,
    newDesign,
    newFormDesign,
  }
}
