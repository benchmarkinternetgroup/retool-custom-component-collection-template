import React, { useState, useEffect } from 'react'
import EmailEditor from 'react-email-editor'
import { useUnlayerEditor } from './unlayerEditorShared'

export const UnlayerFormEditor = () => {
  const [showFieldsModal, setShowFieldsModal] = useState(false)
  const {
    emailEditorRef,
    currentDesign,
    setCurrentDesign,
    emailHtml,
    emailImage,
    projectId,
    retoolId,
    designMode,
    saveForm,
    onReadyForm,
    updateDesign,
    newFormDesign
  } = useUnlayerEditor({ designMode: 'form' })

  type SignupFormEditorField = {
    type: string;
    name: string;
    label: string;
    options: string;
    placeholder_text: string;
    show_label: boolean;
    required: boolean;
    meta_data: object;
    dateFormat: string;
  };

  const editFormEditorField = (currentFieldName: string, currentValue: string, callback: (newValue: SignupFormEditorField[]) => void) => {
     console.log(currentFieldName, currentValue, callback)
  }

  const editFormEditorAllFields = (_fields: string) => {
    setShowFieldsModal(true)
  }

  useEffect(() => {
    if (!showFieldsModal) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFieldsModal(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [showFieldsModal])

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <button className="nxg-button" onClick={() => newFormDesign()}>
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
          onClick={saveForm}
          style={{ float: 'right' }}
        >
          Save Form
        </button>
      </div>

      <EmailEditor
        style={{ width: '100%', height: '800px', marginBottom: '16px' }}
        ref={emailEditorRef}
        onReady={onReadyForm}
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
          tools: {
            'custom#custom_form_block': {
                    properties: {
                        fields: {
                            editor: {
                                data: {
                                    editFormEditorField,
                                    editFormEditorAllFields,
                                },
                            },
                        },
                    },
                },
          },
          user: {
            id: 'admin_' + projectId + '_' + retoolId
          },
          customJS: ['https://app.bmenxgdev.com/blocks/WidgetFormFieldsPicker.js', 'https://app.bmenxgdev.com/blocks/editorBlocks.js']
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

      {showFieldsModal && (
        <div
          className="nxg-modal-overlay"
          onClick={() => setShowFieldsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="nxg-fields-modal-title"
        >
          <div
            className="nxg-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="nxg-fields-modal-title">
              Currently not available to add/remove additional fields
            </p>
            <button
              type="button"
              className="nxg-button nxg-button--primary"
              onClick={() => setShowFieldsModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
