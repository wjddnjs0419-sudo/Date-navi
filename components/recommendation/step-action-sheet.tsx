import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Lock, RefreshCw, Trash2, Unlock } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
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
            <Trash2 size={18} color={deleteDisabled ? C.textMuted : C.danger} />
            <Text testID="step-action-delete-label" style={[s.rowText, s.rowTextDanger, deleteDisabled && s.rowTextDisabled]}>
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
    borderTopLeftRadius: R.hero,
    borderTopRightRadius: R.hero,
    paddingHorizontal: SP.xl,
    paddingTop: SP.md,
    paddingBottom: SP.xxl + SP.xs,
  },
  handle: { width: 40, height: 4, borderRadius: R.badge, backgroundColor: C.border, alignSelf: 'center', marginBottom: SP.md },
  title: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: SP.sm },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: SP.md, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: SP.xs },
  rowDisabled: { opacity: 0.4 },
  rowText: { fontSize: 15, fontWeight: '600', color: C.text },
  rowTextDanger: { color: C.danger },
  rowTextDisabled: { color: C.textMuted },
});
