import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDesign, updateDesign } from '@/lib/api';
import { generateDB0File } from '@/lib/db0Generator';

type Entry = {
  picks: number;
  box: number;
  firstRepeat?: number;
  secondRepeat?: number;
  subTotal: number;
  firstRepeatCount?: number;
  secondRepeatCount?: number;
};

type RowItemProps = {
  entry: Entry;
  idx: number;
  editMode: boolean;
  isExpanded: boolean;
  onToggleExpand: (index: number) => void;
  onOpenRowActions: (index: number) => void;
  onUpdateEntry: (index: number, key: keyof Entry, value: number) => void;
};

const RowItem = memo(function RowItem({
  entry,
  idx,
  editMode,
  isExpanded,
  onToggleExpand,
  onOpenRowActions,
  onUpdateEntry,
}: RowItemProps) {
  return (
    <View style={styles.rowCard}>
      <TouchableOpacity
        style={styles.rowCardHeader}
        onPress={() => {
          if (!editMode) return;
          onToggleExpand(idx);
        }}
        activeOpacity={editMode ? 0.7 : 1}
      >
        <Text style={styles.rowIndex}>Row {idx + 1}</Text>
        <View style={styles.rowHeaderMeta}>
          <View style={styles.metricChip}><Text style={styles.rowMiniStrong}>P:{entry.picks || 0}</Text></View>
          <View style={styles.metricChip}><Text style={styles.rowMiniStrong}>B:{entry.box || 0}</Text></View>
          <Text style={styles.rowSubtotal}>Subtotal: {entry.subTotal || 0}</Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
        </View>

        <TouchableOpacity
          style={styles.rowActionsCompact}
          onPress={() => onOpenRowActions(idx)}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#4338ca" />
        </TouchableOpacity>
      </TouchableOpacity>

      {editMode && isExpanded ? (
        <View style={styles.rowFieldsGrid}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Picks</Text>
            <TextInput
              value={String(entry.picks ?? 0)}
              keyboardType="numeric"
              onChangeText={(v) => onUpdateEntry(idx, 'picks', Number(v) || 0)}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Box No</Text>
            <TextInput
              value={String(entry.box ?? 1)}
              keyboardType="numeric"
              onChangeText={(v) => onUpdateEntry(idx, 'box', Number(v) || 1)}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>1st Repeat Count</Text>
            <TextInput
              value={String(entry.firstRepeatCount ?? 0)}
              keyboardType="numeric"
              onChangeText={(v) => onUpdateEntry(idx, 'firstRepeatCount', Number(v) || 0)}
              style={styles.input}
            />
            {(entry.firstRepeat || 0) > 0 ? <Text style={styles.repeatValue}>= {entry.firstRepeat}</Text> : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>2nd Repeat Count</Text>
            <TextInput
              value={String(entry.secondRepeatCount ?? 0)}
              keyboardType="numeric"
              onChangeText={(v) => onUpdateEntry(idx, 'secondRepeatCount', Number(v) || 0)}
              style={styles.input}
            />
            {(entry.secondRepeat || 0) > 0 ? <Text style={styles.repeatValue}>= {entry.secondRepeat}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}, (prev, next) => {
  return (
    prev.idx === next.idx &&
    prev.editMode === next.editMode &&
    prev.isExpanded === next.isExpanded &&
    prev.entry.picks === next.entry.picks &&
    prev.entry.box === next.entry.box &&
    prev.entry.subTotal === next.entry.subTotal &&
    prev.entry.firstRepeat === next.entry.firstRepeat &&
    prev.entry.secondRepeat === next.entry.secondRepeat &&
    prev.entry.firstRepeatCount === next.entry.firstRepeatCount &&
    prev.entry.secondRepeatCount === next.entry.secondRepeatCount
  );
});

export default function DesignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [design, setDesign] = useState<any | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPaletteOpen, setPreviewPaletteOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<1 | 2 | 3 | 4>(1);
  const [rowColors, setRowColors] = useState<Record<number, string>>({
    1: '#2563eb',
    2: '#facc15',
    3: '#d946ef',
    4: '#06b6d4',
  });
  const [actionOpen, setActionOpen] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [initialSignature, setInitialSignature] = useState('');

  const toSignature = (list: Entry[]) => JSON.stringify(
    list.map((e) => ({
      picks: Number(e.picks) || 0,
      box: Number(e.box) || 0,
      firstRepeatCount: Number(e.firstRepeatCount) || 0,
      secondRepeatCount: Number(e.secondRepeatCount) || 0,
    }))
  );

  const recalculateTotals = (inputEntries: Entry[]): Entry[] => {
    const openRepeats = new Set<number>();
    const openRepeatInfo = new Map<number, { openingIndex: number; picksBeforeRepeat: number }>();
    const repeatValues = new Map<number, { firstRepeat?: number; secondRepeat?: number }>();

    let runningTotal = 0;

    return inputEntries.map((entry, i) => {
      const box = Number(entry.box) || 0;
      const picks = (Number(entry.picks) || 0) * 2;
      let firstRepeat: number | undefined;
      let secondRepeat: number | undefined;

      if (box >= 10) {
        const repeatLevel = Math.floor(box / 10);

        if (openRepeats.has(repeatLevel)) {
          const openInfo = openRepeatInfo.get(repeatLevel);
          if (openInfo) {
            const openingEntry = inputEntries[openInfo.openingIndex];
            const closingPicks = picks;
            const picksBetween = runningTotal - openInfo.picksBeforeRepeat;
            const picksInBlock = picksBetween + closingPicks;

            const repeatCount = repeatLevel === 1
              ? (Number(openingEntry.firstRepeatCount) || 0)
              : (Number(openingEntry.secondRepeatCount) || 0);

            const repeatedPicks = picksInBlock * repeatCount;

            if (!repeatValues.has(openInfo.openingIndex)) {
              repeatValues.set(openInfo.openingIndex, {});
            }
            const info = repeatValues.get(openInfo.openingIndex)!;
            if (repeatLevel === 1) info.firstRepeat = repeatedPicks;
            if (repeatLevel === 2) info.secondRepeat = repeatedPicks;

            runningTotal = openInfo.picksBeforeRepeat + repeatedPicks;
            openRepeats.delete(repeatLevel);
            openRepeatInfo.delete(repeatLevel);
          }
        } else {
          openRepeats.add(repeatLevel);
          openRepeatInfo.set(repeatLevel, {
            openingIndex: i,
            picksBeforeRepeat: runningTotal,
          });
          runningTotal += picks;
        }
      } else {
        runningTotal += picks;
      }

      const stored = repeatValues.get(i);
      if (stored) {
        firstRepeat = stored.firstRepeat;
        secondRepeat = stored.secondRepeat;
      }

      return {
        ...entry,
        firstRepeat,
        secondRepeat,
        subTotal: runningTotal,
      };
    });
  };

  const normalizeEntries = (rawEntries: any[]): Entry[] => {
    const mapped = (rawEntries || []).map((e: any) => ({
      picks: Number(e.picks) || 0,
      box: Number(e.box) || 1,
      subTotal: Number(e.subTotal) || 0,
      firstRepeatCount: e.firstRepeatCount !== undefined ? Number(e.firstRepeatCount) || 0 : undefined,
      secondRepeatCount: e.secondRepeatCount !== undefined ? Number(e.secondRepeatCount) || 0 : undefined,
      firstRepeat: e.firstRepeat !== undefined ? Number(e.firstRepeat) || 0 : undefined,
      secondRepeat: e.secondRepeat !== undefined ? Number(e.secondRepeat) || 0 : undefined,
    }));
    return recalculateTotals(mapped);
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const res = await getDesign(id);
        const d = res.design || res;
        setDesign(d);

        const metadataEntries = d?.metadata?.entries;
        if (Array.isArray(metadataEntries) && metadataEntries.length > 0) {
          const normalized = normalizeEntries(metadataEntries);
          setEntries(normalized);
          setInitialSignature(toSignature(normalized));
        } else {
          setEntries([]);
          setInitialSignature(toSignature([]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load design');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSaveChanges = async () => {
    if (!id || !design) return;
    try {
      setIsSaving(true);
      const currentFilename = (design.filename || 'UNTITLED.DB0').toUpperCase();

      const generated = await generateDB0File(
        entries.map((e) => ({
          picks: Number(e.picks) || 0,
          box: Number(e.box) || 0,
          firstRepeatCount: Number(e.firstRepeatCount) || 0,
          secondRepeatCount: Number(e.secondRepeatCount) || 0,
        })),
        currentFilename,
        totalPicks,
      );

      const bytes = new Uint8Array(generated.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      await updateDesign(id, {
        filename: generated.filename,
        description: design.description ?? null,
        tags: design.tags || [],
        fileData: base64Data,
        metadata: generated.metadata,
      });

      setDesign((prev: any) => prev ? {
        ...prev,
        filename: generated.filename,
        metadata: generated.metadata,
      } : prev);
      setInitialSignature(toSignature(entries));
      Alert.alert('Saved', 'Design updated successfully.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Failed to save design');
    } finally {
      setIsSaving(false);
    }
  };

  const totalPicks = entries.length ? (entries[entries.length - 1]?.subTotal || 0) : 0;
  const isDirty = toSignature(entries) !== initialSignature;

  const updateEntry = useCallback((index: number, key: keyof Entry, value: number) => {
    setEntries((prev) => {
      const updated = prev.map((row, i) => (i === index ? { ...row, [key]: value } : row));
      return recalculateTotals(updated);
    });
  }, []);

  const addRowAfter = useCallback((index: number) => {
    setEntries((prev) => {
      const row: Entry = { picks: 0, box: 1, subTotal: 0 };
      const updated = [...prev.slice(0, index + 1), row, ...prev.slice(index + 1)];
      return recalculateTotals(updated);
    });
  }, []);

  const addRowBefore = useCallback((index: number) => {
    setEntries((prev) => {
      const row: Entry = { picks: 0, box: 1, subTotal: 0 };
      const updated = [...prev.slice(0, index), row, ...prev.slice(index)];
      return recalculateTotals(updated);
    });
  }, []);

  const deleteRow = useCallback((index: number) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter((_, i) => i !== index);
      return recalculateTotals(updated);
    });
  }, []);

  const previewPalette = [
    '#ff0000', '#00ff00', '#0000ff', '#facc15', '#d946ef', '#06e6ff', '#ffffff',
    '#737373', '#ffa500', '#7e22ce', '#ffc0cb', '#8b4513', '#228b22', '#7dd3fc',
    '#d8b4fe', '#90ee90', '#ff1493', '#1e90ff', '#ffd700', '#32cd32', '#ff4500',
  ];

  const expandEntriesForPreview = (sourceEntries: Entry[]): Entry[] => {
    let level2Start = -1;
    let level2End = -1;
    let level2RepeatCount = 1;

    for (let i = 0; i < sourceEntries.length; i++) {
      const box = sourceEntries[i].box;
      if (box >= 20 && box < 30) {
        if (level2Start === -1) {
          level2Start = i;
          level2RepeatCount = sourceEntries[i].secondRepeatCount || 1;
        } else {
          level2End = i;
        }
      }
    }

    const expandLevel1 = (input: Entry[]): Entry[] => {
      const result: Entry[] = [];
      const repeatStack: Array<{ entries: Entry[]; repeatCount: number }> = [];
      const openLevel1 = new Set<number>();

      input.forEach((entry) => {
        const box = entry.box;

        if (box >= 10 && box < 20) {
          const threadNumber = box % 10;
          const threadEntry: Entry = { picks: entry.picks, box: threadNumber, subTotal: 0 };

          if (!openLevel1.has(1)) {
            const repeatCount = entry.firstRepeatCount || 1;
            openLevel1.add(1);
            repeatStack.push({ entries: [threadEntry], repeatCount });
          } else {
            const repeatInfo = repeatStack[repeatStack.length - 1];
            if (repeatInfo) {
              repeatInfo.entries.push(threadEntry);
              for (let i = 0; i < repeatInfo.repeatCount; i++) {
                result.push(...repeatInfo.entries);
              }
              repeatStack.pop();
              openLevel1.delete(1);
            }
          }
        } else if (box >= 20) {
          const threadNumber = box % 10;
          const threadEntry: Entry = { picks: entry.picks, box: threadNumber, subTotal: 0 };
          if (repeatStack.length > 0) {
            repeatStack.forEach((r) => r.entries.push(threadEntry));
          } else {
            result.push(threadEntry);
          }
        } else {
          const threadEntry: Entry = { picks: entry.picks, box: entry.box, subTotal: 0 };
          if (repeatStack.length > 0) {
            repeatStack.forEach((r) => r.entries.push(threadEntry));
          } else {
            result.push(threadEntry);
          }
        }
      });

      return result;
    };

    if (level2Start >= 0 && level2End >= 0) {
      const before = sourceEntries.slice(0, level2Start);
      const content = sourceEntries.slice(level2Start, level2End + 1);
      const after = sourceEntries.slice(level2End + 1);

      const expandedBefore = expandLevel1(before);
      const expandedContent = expandLevel1(content);
      const expandedAfter = expandLevel1(after);

      const result: Entry[] = [...expandedBefore];
      for (let i = 0; i < level2RepeatCount; i++) {
        result.push(...expandedContent);
      }
      result.push(...expandedAfter);
      return result;
    }

    return expandLevel1(sourceEntries);
  };

  const expandedPreviewEntries = expandEntriesForPreview(entries);

  const openRowActions = useCallback((index: number) => {
    setActiveRowIndex(index);
    setActionOpen(true);
  }, []);

  const closeRowActions = useCallback(() => {
    setActionOpen(false);
    setActiveRowIndex(null);
  }, []);

  const toggleExpandRow = useCallback((index: number) => {
    setExpandedRow((prev) => (prev === index ? null : index));
  }, []);

  const sectionHeader = useMemo(() => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Editable Rows</Text>
      <Text style={styles.sectionHint}>
        {editMode
          ? 'Edit mode: tap a row to expand fields. Use Row Actions for insert/delete.'
          : 'Browse mode: scan quickly. Switch to Edit mode to modify values.'}
      </Text>
    </View>
  ), [editMode]);

  const renderRow = useCallback(({ item, index }: { item: Entry; index: number }) => (
    <RowItem
      entry={item}
      idx={index}
      editMode={editMode}
      isExpanded={expandedRow === index}
      onToggleExpand={toggleExpandRow}
      onOpenRowActions={openRowActions}
      onUpdateEntry={updateEntry}
    />
  ), [editMode, expandedRow, openRowActions, toggleExpandRow, updateEntry]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading design...</Text>
      </View>
    );
  }

  if (error || !design) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={64} color="#ef4444" />
        <Text style={styles.errorText}>{error || 'Design not found'}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: design.filename }} />
      <View style={styles.topStickyPanel}>
        <View style={styles.stickyBar}>
          <View style={styles.statsRow}>
            <Text style={styles.statsLine}>
              Total Picks: <Text style={styles.statsValue}>{totalPicks}</Text>
              {'  '}•{'  '}
              Rows: <Text style={styles.statsValue}>{entries.length}</Text>
            </Text>
            {isDirty ? <View style={styles.dirtyBadge}><Text style={styles.dirtyBadgeText}>Unsaved edits</Text></View> : null}
          </View>

          <View style={styles.ctaSection}>
            <TouchableOpacity style={styles.primarySaveButton} onPress={handleSaveChanges} disabled={isSaving || !isDirty}>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.primarySaveButtonText}>{isSaving ? 'Saving' : 'Save Changes'}</Text>
            </TouchableOpacity>

            <View style={styles.secondaryCtasRight}>
              <TouchableOpacity style={styles.iconCtaButton} onPress={() => setPreviewOpen(true)}>
                <Ionicons name="eye-outline" size={18} color="#4338ca" />
              </TouchableOpacity>

              <TouchableOpacity
                style={editMode ? styles.iconCtaButtonActive : styles.iconCtaButton}
                onPress={() => {
                  setEditMode((v) => !v);
                  setExpandedRow(null);
                }}
              >
                <Ionicons name={editMode ? 'create' : 'list'} size={18} color={editMode ? '#fff' : '#374151'} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconCtaButton} onPress={() => addRowAfter(entries.length - 1)}>
                <Ionicons name="add" size={20} color="#065f46" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        style={styles.container}
        data={entries}
        keyExtractor={(_, index) => `row-${index}`}
        renderItem={renderRow}
        extraData={{ editMode, expandedRow }}
        initialNumToRender={14}
        maxToRenderPerBatch={16}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: 68, offset: 68 * index, index })}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={sectionHeader}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      <Modal visible={actionOpen} transparent animationType="slide" onRequestClose={closeRowActions}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetOverlayTap} activeOpacity={1} onPress={closeRowActions} />
          <View style={styles.bottomSheet}>
            <Text style={styles.sheetTitle}>Row Actions</Text>
            <Text style={styles.sheetSubtitle}>Row {activeRowIndex !== null ? activeRowIndex + 1 : '-'}</Text>

            <TouchableOpacity
              style={styles.sheetActionBtn}
              onPress={() => {
                if (activeRowIndex !== null) addRowBefore(activeRowIndex);
                closeRowActions();
              }}
            >
              <Ionicons name="arrow-up-circle-outline" size={18} color="#065f46" />
              <Text style={styles.sheetActionText}>Add Row Above</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetActionBtn}
              onPress={() => {
                if (activeRowIndex !== null) addRowAfter(activeRowIndex);
                closeRowActions();
              }}
            >
              <Ionicons name="arrow-down-circle-outline" size={18} color="#065f46" />
              <Text style={styles.sheetActionText}>Add Row Below</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetActionBtn, styles.sheetDeleteBtn]}
              onPress={() => {
                if (activeRowIndex !== null) deleteRow(activeRowIndex);
                closeRowActions();
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={[styles.sheetActionText, { color: '#b91c1c' }]}>Delete Row</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeRowActions}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetOverlayTap} activeOpacity={1} onPress={() => setPreviewOpen(false)} />
          <View style={[styles.bottomSheet, { height: '80%' }]}>
            <Text style={styles.sheetTitle}>Pattern Preview</Text>
            <Text style={styles.sheetSubtitle}>{design.filename} • {totalPicks} picks</Text>
            <View style={styles.previewBox}>
              <View style={styles.legendRow}>
                {[1, 2, 3, 4].map((thread) => (
                  <TouchableOpacity
                    key={`thread-${thread}`}
                    style={styles.legendItem}
                    onPress={() => {
                      setSelectedThread(thread as 1 | 2 | 3 | 4);
                      setPreviewPaletteOpen((v) => !v);
                    }}
                  >
                    <View style={[styles.legendColor, { backgroundColor: rowColors[thread] }]} />
                    <Text style={styles.legendText}>T{thread}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {previewPaletteOpen ? (
                <View style={styles.paletteRow}>
                  {previewPalette.map((color) => (
                    <TouchableOpacity
                      key={`${selectedThread}-${color}`}
                      style={[styles.paletteColor, { backgroundColor: color }]}
                      onPress={() => {
                        setRowColors((prev) => ({ ...prev, [selectedThread]: color }));
                      }}
                    />
                  ))}
                </View>
              ) : null}
              <ScrollView style={styles.previewRows} contentContainerStyle={styles.previewRowsContent}>
                {expandedPreviewEntries.length === 0 ? (
                  <Text style={styles.previewEmptyText}>No rows available for preview.</Text>
                ) : (
                  expandedPreviewEntries.map((entry, idx) => {
                    const pickCount = (Number(entry.picks) || 0) * 2;
                    const dynamicHeight = Math.max(8, Math.round(pickCount * 1.2));
                    return (
                    <View
                      key={`pv-${idx}`}
                      style={styles.previewBandLine}
                    >
                      <View style={[styles.previewBandLabelWrap, { height: dynamicHeight }]}>
                        <Text style={styles.previewBandLabel}>{pickCount}x</Text>
                      </View>
                      <View
                        style={[
                          styles.previewRow,
                          {
                            height: dynamicHeight,
                            backgroundColor: rowColors[entry.box] || '#9ca3af',
                          },
                        ]}
                      />
                    </View>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setPreviewOpen(false)}>
              <Text style={styles.sheetCloseText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  topStickyPanel: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  errorText: { marginTop: 16, fontSize: 16, color: '#ef4444', textAlign: 'center' },
  section: { backgroundColor: '#fff', marginTop: 16, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  sectionHint: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  stickyBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsLine: { color: '#374151', fontSize: 14, fontWeight: '600' },
  statsValue: { color: '#1e1b4b', fontSize: 18, fontWeight: '800' },
  dirtyBadge: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dirtyBadgeText: { color: '#92400e', fontWeight: '700', fontSize: 11 },
  ctaSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  primarySaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primarySaveButtonText: { color: '#fff', fontWeight: '800' },
  secondaryCtasRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconCtaButton: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCtaButtonActive: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#4338ca',
    backgroundColor: '#4338ca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: { flex: 1, minHeight: 480, borderWidth: 1, borderColor: '#111827', borderRadius: 6, overflow: 'hidden' },
  legendRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#d1d5db', backgroundColor: '#fff' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendColor: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#9ca3af' },
  legendText: { fontWeight: '700', color: '#374151' },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  paletteColor: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  previewRows: { flex: 1, backgroundColor: '#fff' },
  previewRowsContent: { paddingVertical: 8, minHeight: 420 },
  previewBandLine: { flexDirection: 'row', alignItems: 'stretch' },
  previewBandLabelWrap: { width: 44, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 },
  previewBandLabel: { color: '#6b7280', fontWeight: '700' },
  previewRow: { flex: 1, width: '100%' },
  previewEmptyText: { textAlign: 'center', color: '#6b7280', marginTop: 24, fontWeight: '600' },
  rowCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  rowCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rowHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', marginLeft: 8 },
  metricChip: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rowMiniStrong: { color: '#3730a3', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  rowIndex: { fontWeight: '700', color: '#111827' },
  rowSubtotal: { fontWeight: '600', color: '#374151', fontSize: 12 },
  rowActionsCompact: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  rowFieldsGrid: { gap: 10 },
  fieldBlock: {},
  fieldLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#fff' },
  repeatValue: { marginTop: 4, fontSize: 12, color: '#6b7280' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheetOverlayTap: { flex: 1 },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetSubtitle: { color: '#6b7280', marginBottom: 8 },
  sheetActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 },
  sheetDeleteBtn: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  sheetActionText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sheetCloseBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#f3f4f6' },
  sheetCloseText: { fontWeight: '600', color: '#374151' },
});
