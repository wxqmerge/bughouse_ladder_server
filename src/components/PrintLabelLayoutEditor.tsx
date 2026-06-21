import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Save, Copy, Trash2, Download, Upload, Plus, RotateCcw, Eye } from 'lucide-react';
import type { PrintLabelLayout, PrintLabelFieldLayout } from '../../shared/types';
import { loadLayouts, saveLayouts, exportLayouts, importLayouts } from '../utils/printLabelLayouts';
import { dataService } from '../services/dataService';

const ALL_FIELDS = [
  { key: 'ladderName', label: 'Ladder Name' },
  { key: 'group', label: 'Group' },
  { key: 'rating', label: 'Rating' },
  { key: 'rank', label: 'Rank' },
  { key: 'grade', label: 'Grade' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'schoolRoom', label: 'School/Room' },
];

const DEFAULT_LAYOUTS: Record<string, Record<string, { x: number; y: number; fontSize: number }>> = {
  '20': {
    ladderName:  { x: 2.5,  y: 13.8, fontSize: 6 },
    group:       { x: 74.3, y: 34.6, fontSize: 24 },
    rating:      { x: 41.3, y: 13.8, fontSize: 12 },
    rank:        { x: 74.3, y: 3.5,  fontSize: 17 },
    grade:       { x: 2.5,  y: 69.2, fontSize: 13 },
    firstName:   { x: 0.8,  y: 27.7, fontSize: 30 },
    lastName:    { x: 24.8, y: 69.2, fontSize: 12 },
    schoolRoom:  { x: 57.8, y: 69.2, fontSize: 10 },
  },
  '30': {
    ladderName:  { x: 2.5,  y: 13.8, fontSize: 4.9 },
    group:       { x: 74.3, y: 34.6, fontSize: 19.6 },
    rating:      { x: 41.3, y: 13.8, fontSize: 9.8 },
    rank:        { x: 74.3, y: 3.5,  fontSize: 13.9 },
    grade:       { x: 2.5,  y: 69.2, fontSize: 10.6 },
    firstName:   { x: 0.8,  y: 27.7, fontSize: 24.5 },
    lastName:    { x: 24.8, y: 69.2, fontSize: 9.8 },
    schoolRoom:  { x: 57.8, y: 69.2, fontSize: 8.2 },
  },
};

interface Props {
  onClose: () => void;
  onSave: (layout: PrintLabelLayout) => void;
  currentLayout: PrintLabelLayout | null;
  labelsPerPage: 20 | 30;
}

export default function PrintLabelLayoutEditor({ onClose, onSave, currentLayout, labelsPerPage }: Props) {
  const [layouts, setLayouts] = useState<PrintLabelLayout[]>(loadLayouts);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState<PrintLabelLayout | null>(null);
  const [preview, setPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaults = DEFAULT_LAYOUTS[String(labelsPerPage)];

  const selectedLayout = layouts[selectedIdx] || layouts[0] || null;

  const startEdit = useCallback((layout: PrintLabelLayout) => {
    setEditing(JSON.parse(JSON.stringify(layout)));
  }, []);

  const newLayout = () => {
    const newL: PrintLabelLayout = {
      name: `Layout ${layouts.length + 1}`,
      labelsPerPage,
      fields: Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => [k, { ...v }])
      ),
    };
    const updated = [...layouts, newL];
    setLayouts(updated);
    saveLayouts(updated);
    dataService.savePrintLayoutToServer(newL).catch(() => {/* silent */});
    setSelectedIdx(updated.length - 1);
    startEdit(newL);
  };

  const duplicateLayout = (idx: number) => {
    const src = layouts[idx];
    const dup: PrintLabelLayout = {
      ...src,
      name: `${src.name} (copy)`,
      fields: JSON.parse(JSON.stringify(src.fields)),
    };
    const updated = [...layouts];
    updated.splice(idx + 1, 0, dup);
    setLayouts(updated);
    saveLayouts(updated);
    dataService.savePrintLayoutToServer(dup).catch(() => {/* silent */});
    setSelectedIdx(idx + 1);
  };

  const deleteLayout = (idx: number) => {
    if (layouts.length <= 1) return;
    const deleted = layouts[idx];
    const updated = layouts.filter((_, i) => i !== idx);
    setLayouts(updated);
    saveLayouts(updated);
    dataService.deletePrintLayoutFromServer(deleted.name).catch(() => {/* silent */});
    setSelectedIdx(Math.min(selectedIdx, updated.length - 1));
  };

  const renameLayout = (idx: number, name: string) => {
    const updated = [...layouts];
    updated[idx] = { ...updated[idx], name };
    setLayouts(updated);
    saveLayouts(updated);
    dataService.savePrintLayoutToServer(updated[idx]).catch(() => {/* silent */});
  };

  const handleExport = () => {
    const json = exportLayouts(layouts);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'print_label_layouts.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importLayouts(reader.result as string);
      if (imported) {
        setLayouts(imported);
        saveLayouts(imported);
        imported.forEach(l => dataService.savePrintLayoutToServer(l).catch(() => {/* silent */}));
        setSelectedIdx(0);
      } else {
        alert('Invalid layout file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFieldChange = (key: string, field: keyof PrintLabelFieldLayout, value: number) => {
    if (!editing) return;
    const clamped = field === 'fontSize' ? Math.max(0, value) : Math.max(0, Math.min(100, value));
    editing.fields[key] = { ...editing.fields[key], [field]: clamped };
    setEditing({ ...editing, fields: { ...editing.fields } });
  };

  const resetField = (key: string) => {
    if (!editing || !defaults[key]) return;
    editing.fields[key] = { ...defaults[key] };
    setEditing({ ...editing, fields: { ...editing.fields } });
  };

  const handleSave = async () => {
    if (!editing) return;
    const idx = layouts.findIndex(l => l.name === editing.name && l.labelsPerPage === editing.labelsPerPage);
    const updated = [...layouts];
    if (idx >= 0) {
      updated[idx] = editing;
    } else {
      updated.push(editing);
    }
    setLayouts(updated);
    saveLayouts(updated);

    // Push to server in background
    dataService.savePrintLayoutToServer(editing).catch(() => {/* silent */});

    onSave(editing);
    onClose();
  };

  const handleSelect = (idx: number) => {
    setSelectedIdx(idx);
    startEdit(layouts[idx]);
  };

  // Fetch layouts from server on mount (SERVER mode)
  useEffect(() => {
    let cancelled = false;
    dataService.fetchPrintLayoutsFromServer().then(serverLayouts => {
      if (cancelled || !serverLayouts?.length) return;
      // Merge: use server layouts, but keep any local-only ones
      const serverNames = new Set(serverLayouts.map((l: PrintLabelLayout) => `${l.name}|${l.labelsPerPage}`));
      const localOnly = layouts.filter(l => !serverNames.has(`${l.name}|${l.labelsPerPage}`));
      const merged = [...serverLayouts, ...localOnly];
      setLayouts(merged);
      saveLayouts(merged);
      setSelectedIdx(0);
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open edit for current layout on mount
  if (!editing && selectedLayout) {
    startEdit(selectedLayout);
  }

  const previewFields = editing?.fields || {};

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10003,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white', borderRadius: '8px',
          width: '95vw', maxWidth: '1100px', height: '90vh', maxHeight: '750px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>Label Layout Editor</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body: 3 columns */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Preset list */}
          <div style={{ width: '220px', minWidth: '220px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px' }}>
              <button onClick={newLayout} title="New layout" style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Plus size={12} /> New
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px' }}>
              {layouts.map((l, i) => (
                <div
                  key={i}
                  onClick={() => handleSelect(i)}
                  style={{
                    padding: '12px 10px', marginBottom: '2px', borderRadius: '6px',
                    backgroundColor: i === selectedIdx ? '#eff6ff' : 'transparent',
                    border: i === selectedIdx ? '1.5px solid #2563eb' : '1px solid transparent',
                    cursor: 'pointer', fontSize: '13px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <input
                    value={l.name}
                    onChange={e => renameLayout(i, e.target.value)}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', color: '#1e293b', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
                    <button onClick={e => { e.stopPropagation(); duplicateLayout(i); }} title="Duplicate" style={{ padding: '4px 6px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                      <Copy size={14} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteLayout(i); }} title="Delete" style={{ padding: '4px 6px', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '6px' }}>
              <button onClick={handleExport} title="Export JSON" style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Download size={12} /> Export
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Import JSON" style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Upload size={12} /> Import
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Center: Field controls */}
          <div style={{ width: '340px', minWidth: '340px', borderRight: '1px solid #e2e8f0', overflow: 'auto', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                Fields ({labelsPerPage}/page)
              </span>
              <button onClick={() => {
                if (!editing) return;
                editing.fields = Object.fromEntries(
                  Object.keys(defaults).map(k => [k, { ...defaults[k] }])
                );
                setEditing({ ...editing, fields: { ...editing.fields } });
              }} title="Reset all to defaults" style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                <RotateCcw size={12} /> Reset All
              </button>
            </div>
            {ALL_FIELDS.map(f => {
              const val = previewFields[f.key] || { x: 0, y: 0, fontSize: 10 };
              return (
                <div key={f.key} style={{ marginBottom: '10px', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>{f.label}</span>
                    <button onClick={() => resetField(f.key)} title="Reset to default" style={{ padding: '2px 6px', borderRadius: '3px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>
                      <RotateCcw size={10} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>X %</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button onClick={() => handleFieldChange(f.key, 'x', val.x - 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>-</button>
                        <input type="number" min={0} max={100} step={0.1} value={val.x} onChange={e => handleFieldChange(f.key, 'x', parseFloat(e.target.value) || 0)} style={{ width: '50px', textAlign: 'center', padding: '3px', borderRadius: '3px', border: '1px solid #d1d5db', fontSize: '12px' }} />
                        <button onClick={() => handleFieldChange(f.key, 'x', val.x + 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>+</button>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Y %</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button onClick={() => handleFieldChange(f.key, 'y', val.y - 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>-</button>
                        <input type="number" min={0} max={100} step={0.1} value={val.y} onChange={e => handleFieldChange(f.key, 'y', parseFloat(e.target.value) || 0)} style={{ width: '50px', textAlign: 'center', padding: '3px', borderRadius: '3px', border: '1px solid #d1d5db', fontSize: '12px' }} />
                        <button onClick={() => handleFieldChange(f.key, 'y', val.y + 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>+</button>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Size pt</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button onClick={() => handleFieldChange(f.key, 'fontSize', val.fontSize - 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>-</button>
                        <input type="number" min={0} max={72} step={0.5} value={val.fontSize} onChange={e => handleFieldChange(f.key, 'fontSize', parseFloat(e.target.value) || 0)} style={{ width: '50px', textAlign: 'center', padding: '3px', borderRadius: '3px', border: '1px solid #d1d5db', fontSize: '12px' }} />
                        <button onClick={() => handleFieldChange(f.key, 'fontSize', val.fontSize + 0.5)} style={{ width: '22px', height: '24px', border: '1px solid #d1d5db', borderRadius: '3px', background: 'white', cursor: 'pointer', fontSize: '12px' }}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Live Preview */}
          <div style={{ flex: 1, padding: '16px', overflow: 'auto', backgroundColor: '#f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>Preview</span>
              <button onClick={() => setPreview(!preview)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                <Eye size={12} /> {preview ? 'Hide' : 'Show'}
              </button>
            </div>
            {preview && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    width: '260px', height: '110px', position: 'relative',
                    backgroundColor: 'white', border: '2px solid #333',
                    borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                >
                  {ALL_FIELDS.map(f => {
                    const val = previewFields[f.key];
                    if (!val) return null;
                    const sampleText = f.label === 'Ladder Name' ? 'Bughouse' :
                      f.key === 'group' ? 'A' :
                      f.key === 'rating' ? '1050' :
                      f.key === 'rank' ? '5' :
                      f.key === 'grade' ? '5th' :
                      f.key === 'firstName' ? 'Alice' :
                      f.key === 'lastName' ? 'Smith' :
                      'Room 12';
                    return (
                      <span
                        key={f.key}
                        style={{
                          position: 'absolute',
                          left: `${val.x}%`,
                          top: `${val.y}%`,
                          fontSize: `${val.fontSize || 10}pt`,
                          fontFamily: 'Arial, sans-serif',
                          color: '#1e293b',
                          whiteSpace: 'nowrap',
                          fontWeight: f.key === 'rank' ? 'bold' : 'normal',
                          pointerEvents: 'none',
                        }}
                      >
                        {sampleText}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                Adjust X (horizontal), Y (vertical), and Size for each field. Changes appear live in the preview above.
                X/Y are percentages of label width/height. Font size is in points.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Save size={16} /> Save Layout
          </button>
        </div>
      </div>
    </div>
  );
}
