import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Lock, RefreshCw, Trash2, Unlock } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { useI18n } from '../../lib/i18n';

export type StepActionSheetProps = {
  visible: boolean;
  placeName: string;
  locked: boolean;
  canDelete: boolean;
  onLockToggle: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function StepActionSheet({
  visible, placeName, locked, canDelete, onLockToggle, onReplace, onDelete, onClose,
}: StepActionSheetProps) {
  const { t } = useI18n();
  const deleteDisabled = locked || !canDelete;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        <Pressable style={s.backdrop} onPress={onClose} testID="step-action-sheet-backdrop" />
        <View style={s.panel}>
          <View style={s.handle} />
          <Text numberOfLines={1} testID="step-action-sheet-title" style={s.title}>{placeName}</Text>

          <TouchableOpacity accessibilityRole="button" testID="step-action-lock-toggle" onPress={onLockToggle} style={s.row}>
            {locked ? <Unlock size={18} color={C.text} /> : <Lock size={18} color={C.text} />}
            <Text testID="step-action-lock-toggle-label" style={s.rowText}>
              {locked ? t('modeFlow.courseResult.unlock') : t('modeFlow.courseResult.lock')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            testID="step-action-replace"
            disabled={locked}
            onPress={onReplace}
            style={[s.row, locked && s.rowDisabled]}
          >
            <RefreshCw size={18} color={locked ? C.textMuted : C.text} />
            <Text style={[s.rowText, locked && s.rowTextDisabled]}>{t('modeFlow.courseResult.replace')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            testID="step-action-delete"
            disabled={deleteDisabled}
            onPress={onDelete}
            style={[s.row, deleteDisabled && s.rowDisabled]}
          >
            <Trash2 size={18} color={deleteDisabled ? C.textMuted : C.pinkDeep} />
            <Text testID="step-action-delete-label" style={[s.rowText, deleteDisabled && s.rowTextDisabled]}>
              {canDelete ? t('modeFlow.courseResult.delete') : t('modeFlow.courseResult.deleteMin')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(31, 31, 36, 0.28)' },
  panel: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 10 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 4 },
  rowDisabled: { opacity: 0.4 },
  rowText: { fontSize: 15, fontWeight: '600', color: C.text },
  rowTextDisabled: { color: C.textMuted },
});
