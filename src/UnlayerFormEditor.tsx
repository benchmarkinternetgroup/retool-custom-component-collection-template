import React, { useState, useEffect, useRef } from 'react'
import EmailEditor from 'react-email-editor'
import { useUnlayerEditor, isJson } from './unlayerEditorShared'

type SignupFormEditorField = {
  type: string
  name: string
  label: string
  options: string
  placeholder_text: string
  show_label: boolean
  required: boolean
  meta_data: object
  dateFormat: string
}

export const UnlayerFormEditor = () => {
  const [showFieldsModal, setShowFieldsModal] = useState(false)
  const [showEditFieldModal, setShowEditFieldModal] = useState(false)
  const [editFieldModalData, setEditFieldModalData] = useState<{
    fieldName: string
    fields: SignupFormEditorField[]
  } | null>(null)
  const [editFieldDraft, setEditFieldDraft] = useState<SignupFormEditorField | null>(null)
  const editFormEditorFieldCallbackRef = useRef<((newValue: SignupFormEditorField[]) => void) | null>(null)
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

  const editFormEditorField = (
    currentFieldName: string,
    currentValue: string,
    callback: (newValue: SignupFormEditorField[]) => void
  ) => {
    const currentFormFieldValue = isJson(currentValue) ? JSON.parse(currentValue) : []
    if (currentFieldName && currentFormFieldValue.length > 0) {
      const fields = currentFormFieldValue as SignupFormEditorField[]
      const matchingField = fields.find((f) => f.name === currentFieldName)
      if (matchingField) {
        editFormEditorFieldCallbackRef.current = callback
        setEditFieldModalData({ fieldName: currentFieldName, fields })
        setEditFieldDraft({ ...matchingField })
        setShowEditFieldModal(true)
      }
    }
  }

  const updateEditorFields = (updatedFormFields: SignupFormEditorField[]) => {
    const callback = editFormEditorFieldCallbackRef.current
    if (callback) {
      callback(JSON.parse(JSON.stringify(updatedFormFields)))
      editFormEditorFieldCallbackRef.current = null
    }
    setShowEditFieldModal(false)
    setEditFieldModalData(null)
    setEditFieldDraft(null)
  }

  const closeEditFieldModal = () => {
    editFormEditorFieldCallbackRef.current = null
    setShowEditFieldModal(false)
    setEditFieldModalData(null)
    setEditFieldDraft(null)
  }

  const editFormEditorAllFields = (_fields: string) => {
    setShowFieldsModal(true)
  }

  useEffect(() => {
    if (!showFieldsModal && !showEditFieldModal) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFieldsModal(false)
        editFormEditorFieldCallbackRef.current = null
        setShowEditFieldModal(false)
        setEditFieldModalData(null)
        setEditFieldDraft(null)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [showFieldsModal, showEditFieldModal])

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
            style={{ width: '600px' }}
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

      {showEditFieldModal && editFieldModalData && editFieldDraft && (
        <div
          className="nxg-modal-overlay"
          onClick={closeEditFieldModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="nxg-edit-field-modal-title"
        >
          <div
            className="nxg-modal-box"
            style={{ width: '600px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="nxg-edit-field-modal-title" style={{ marginTop: 0 }}>
              Edit field
            </h2>
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="edit-form-field-label" style={{ display: 'block', marginBottom: '4px' }}>
                Form label text <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                id="edit-form-field-label"
                type="text"
                className="nxg-text-input"
                value={editFieldDraft.label}
                onChange={(e) => setEditFieldDraft({ ...editFieldDraft, label: e.target.value })}
                maxLength={255}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Show label</span>
              <input
                type="checkbox"
                id="edit-form-show-label"
                checked={editFieldDraft.show_label}
                onChange={(e) => setEditFieldDraft({ ...editFieldDraft, show_label: e.target.checked })}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="edit-form-placeholder" style={{ display: 'block', marginBottom: '4px' }}>
                Placeholder text
              </label>
              <input
                id="edit-form-placeholder"
                type="text"
                className="nxg-text-input"
                value={editFieldDraft.placeholder_text}
                onChange={(e) =>
                  setEditFieldDraft({ ...editFieldDraft, placeholder_text: e.target.value })
                }
                maxLength={255}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="edit-form-required"
                checked={editFieldDraft.required}
                disabled={editFieldDraft.type === 'email'}
                onChange={(e) => setEditFieldDraft({ ...editFieldDraft, required: e.target.checked })}
              />
              <label htmlFor="edit-form-required" style={{ margin: 0 }}>
                Required field
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="nxg-button" onClick={closeEditFieldModal}>
                Cancel
              </button>
              <button
                type="button"
                className="nxg-button nxg-button--primary"
                disabled={!editFieldDraft.label.trim()}
                onClick={() => {
                  const updatedFormFields = editFieldModalData.fields.map((field) =>
                    field.name === editFieldModalData.fieldName ? editFieldDraft : field
                  )
                  updateEditorFields(updatedFormFields)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
