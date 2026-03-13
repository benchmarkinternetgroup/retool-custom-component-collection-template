import React from 'react'
import EmailEditor from 'react-email-editor'
import { useUnlayerEditor } from './unlayerEditorShared'

export const UnlayerFormEditor = () => {
  const {
    emailEditorRef,
    currentDesign,
    setCurrentDesign,
    emailHtml,
    emailImage,
    projectId,
    retoolId,
    designMode,
    saveEmail,
    onReady,
    updateDesign,
    newDesign
  } = useUnlayerEditor({ designMode: 'form' })

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <button className="nxg-button" onClick={() => newDesign()}>
          Clear Design
        </button>
        <button
          className="nxg-button"
          style={{ marginLeft: '8px' }}
          onClick={() => updateDesign()}
        >
          Update Design from Input
        </button>
        <button
          className="nxg-button nxg-button--primary"
          onClick={saveEmail}
          style={{ float: 'right' }}
        >
          Save Form
        </button>
      </div>

      <EmailEditor
        style={{ width: '100%', height: '800px', marginBottom: '16px' }}
        ref={emailEditorRef}
        onReady={onReady}
        options={{
          projectId: parseInt(projectId) || 0,
          version: '1.309.4',
          designMode,
          displayMode: 'web',
          appearance: {
            theme: 'modern_light',
            panels: {
              tools: {
                dock: 'left'
              }
            }
          },
          user: {
            id: 'admin_' + projectId + '_' + retoolId
          }
        }}
      />
      <div style={{ marginBottom: '16px' }}>
        <label>Form Design (JSON)</label>
        <textarea
          className="nxg-textarea"
          value={currentDesign}
          onChange={(e) => setCurrentDesign(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label>Form HTML</label>
        <textarea className="nxg-textarea" value={emailHtml} disabled={true} />
      </div>
      <div>
        <label>Form Image</label>
        <input
          type="text"
          className="nxg-text-input"
          value={emailImage}
          disabled={true}
        />
      </div>
    </div>
  )
}
