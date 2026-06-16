import React, { useEffect, useRef, useState } from 'react'
import type { EditorRef, EmailEditorProps } from 'react-email-editor'
import { Retool } from '@tryretool/custom-component-support'
import { scratch } from './email-templates/scratch'
import { scratch as formScratch } from './form-templates/scratch'
import {
  createUnlayerImageBridge,
  type ImageBridge,
  type BridgeHandlers,
  type UnlayerWithFileStorage,
  type ImageUploadResult,
  type UserUploadsResult,
  type ImageRemoveResult,
} from './unlayerImageBridge'

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

  // --- NXG-3171: Unlayer image-upload bridge (delegated to Retool queries) ---
  // Outbound: the component sets these and fires the matching event; the Retool app reads them.
  const [, setImageUploadRequest] = Retool.useStateObject({
    name: 'imageUploadRequest',
    inspector: 'hidden'
  })
  const [, setUserUploadsRequest] = Retool.useStateObject({
    name: 'userUploadsRequest',
    inspector: 'hidden'
  })
  const [, setImageRemoveRequest] = Retool.useStateObject({
    name: 'imageRemoveRequest',
    inspector: 'hidden'
  })
  const triggerImageUploadRequested = Retool.useEventCallback({
    name: 'onImageUploadRequested'
  })
  const triggerUserUploadsRequested = Retool.useEventCallback({
    name: 'onUserUploadsRequested'
  })
  const triggerImageRemoveRequested = Retool.useEventCallback({
    name: 'onImageRemoveRequested'
  })
  // Inbound: the Retool app binds these to its handler-query results; the component reads them.
  const [imageUploadResult] = Retool.useStateObject({
    name: 'imageUploadResult',
    inspector: 'text'
  })
  const [userUploadsResult] = Retool.useStateObject({
    name: 'userUploadsResult',
    inspector: 'text'
  })
  const [imageRemoveResult] = Retool.useStateObject({
    name: 'imageRemoveResult',
    inspector: 'text'
  })

  // Latest dispatch handlers in a ref so the (stable) bridge always uses fresh Retool setters.
  const bridgeHandlersRef = useRef<BridgeHandlers | null>(null)
  bridgeHandlersRef.current = {
    dispatchUpload: (req) => {
      setImageUploadRequest(req as unknown as Retool.SerializableObject)
      triggerImageUploadRequested()
    },
    dispatchList: (req) => {
      setUserUploadsRequest(req as unknown as Retool.SerializableObject)
      triggerUserUploadsRequested()
    },
    dispatchRemove: (req) => {
      setImageRemoveRequest(req as unknown as Retool.SerializableObject)
      triggerImageRemoveRequested()
    }
  }

  const bridgeRef = useRef<ImageBridge | null>(null)
  if (bridgeRef.current === null) {
    bridgeRef.current = createUnlayerImageBridge(() => bridgeHandlersRef.current!)
  }

  const bridgeRegisteredRef = useRef(false)
  const registerImageBridge = () => {
    const unlayer = emailEditorRef.current?.editor
    if (!unlayer || bridgeRegisteredRef.current) {
      return
    }
    bridgeRef.current?.register(unlayer as unknown as UnlayerWithFileStorage)
    bridgeRegisteredRef.current = true
  }

  // Correlate inbound results back to the Unlayer callbacks waiting on them.
  useEffect(() => {
    const result = imageUploadResult as unknown as ImageUploadResult | undefined
    if (result?.requestId) {
      bridgeRef.current?.resolveUpload(result)
      // Evict the (up to ~13 MB) base64 payload from the Retool model once settled.
      setImageUploadRequest({ requestId: null } as unknown as Retool.SerializableObject)
    }
  }, [imageUploadResult])

  useEffect(() => {
    const result = userUploadsResult as unknown as UserUploadsResult | undefined
    if (result?.requestId) {
      bridgeRef.current?.resolveList(result)
    }
  }, [userUploadsResult])

  useEffect(() => {
    const result = imageRemoveResult as unknown as ImageRemoveResult | undefined
    if (result?.requestId) {
      bridgeRef.current?.resolveRemove(result)
    }
  }, [imageRemoveResult])

  const saveDesign = () => {
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
    registerImageBridge()
    loadEmailDesignFromState()
  }

  const onReadyForm: EmailEditorProps['onReady'] = () => {
    registerImageBridge()
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
    saveDesign,
    onReady,
    onReadyForm,
    updateDesign,
    newDesign,
    newFormDesign,
  }
}
