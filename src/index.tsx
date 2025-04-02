import React, { useRef, useState } from 'react'
import EmailEditor, { EditorRef, EmailEditorProps } from 'react-email-editor'
import { Retool } from '@tryretool/custom-component-support'
import { scratch } from './email-templates/scratch'
import { sample } from './email-templates/sample'
export const UnlayerEditor = () => {
  const [projectId] = Retool.useStateString({ name: 'projectId' })
  const [emailDesign, setEmailDesign] = Retool.useStateString({
    name: 'emailDesign'
  })
  const [currentDesign, setCurrentDesign] = useState('')
  const [emailHtml, setEmailHtml] = Retool.useStateString({ name: 'emailHtml' })
  const emailEditorRef = useRef<EditorRef>(null)
  const isJson = (str: string) => {
    try {
      JSON.parse(str)
      return true
    } catch (e) {
      return false
    }
  }

  const saveEmail = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.exportHtml((data) => {
      const { design, html } = data
      setEmailDesign(JSON.stringify(design))
      setEmailHtml(html)
      setCurrentDesign(JSON.stringify(design))
      triggerSave()
    })
  }

  const onReady: EmailEditorProps['onReady'] = () => {
    const parsedDesign =
      emailDesign && isJson(emailDesign)
        ? JSON.parse(emailDesign)
        : JSON.parse(scratch)
    loadEmailDesign(parsedDesign)
    setCurrentDesign(JSON.stringify(parsedDesign))
  }

  const updateDesign = () => {
    const parsedDesign =
      currentDesign && isJson(currentDesign) ? JSON.parse(currentDesign) : null
    if (parsedDesign) {
      loadEmailDesign(parsedDesign)
    }
  }

  const loadEmailDesign = (design: any) => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.loadDesign(design)
  }

  const loadSampleDesign = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.loadDesign(JSON.parse(sample))
  }

  const newDesign = () => {
    const unlayer = emailEditorRef.current?.editor
    unlayer?.loadDesign(JSON.parse(scratch))
  }

  const triggerSave = Retool.useEventCallback({ name: 'triggerSave' })
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <button style={{ marginLeft: '10px' }} onClick={() => newDesign()}>
          Clear Design
        </button>
        <button style={{ marginLeft: '10px' }} onClick={() => updateDesign()}>
          Load Design (from State)
        </button>
        <button style={{ marginLeft: '10px' }} onClick={() => updateDesign()}>
          Update Design (from Input)
        </button>
        <button
          style={{ marginLeft: '10px' }}
          onClick={() => loadSampleDesign()}
        >
          Load Sample Design
        </button>
        <button onClick={saveEmail} style={{ float: 'right' }}>
          Save Email
        </button>
      </div>

      <EmailEditor
        style={{ width: '100%', height: '800px', marginBottom: '20px' }}
        ref={emailEditorRef}
        onReady={onReady}
        projectId={projectId}
      />
      <div style={{ marginBottom: '20px' }}>
        <label>Email Design</label>
        <textarea
          style={{ width: '100%', height: '100px' }}
          value={currentDesign}
          onChange={(e) => setCurrentDesign(e.target.value)}
        />
      </div>
      <div>
        <label>Email HTML</label>
        <textarea
          style={{ width: '100%', height: '100px' }}
          value={emailHtml}
          disabled={true}
        />
      </div>
    </div>
  )
}
