import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Lock, RefreshCw, Trash2, Unlock } from '../iconography';
import { C, DS, SP } from '../../constants/theme';
import { ModalSurface } from '../ui';
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
    <ModalSurface
      visible={visible}
      onClose={onClose}
      variant="sheet"
      title={placeName}
      titleTestID="step-action-sheet-title"
      scrimTestID="step-action-sheet-backdrop"
      containerStyle={s.panel}
    >

          <TouchableOpacity accessibilityRole="button" testID="step-action-lock-toggle" onPress={onLockToggle} activeOpacity={0.88} style={s.row}>
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
            activeOpacity={0.88}
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
            activeOpacity={0.88}
            style={[s.row, deleteDisabled && s.rowDisabled]}
          >
            <Trash2 size={18} color={deleteDisabled ? C.textMuted : C.danger} />
            <Text testID="step-action-delete-label" style={[s.rowText, s.rowTextDanger, deleteDisabled && s.rowTextDisabled]}>
              {canDelete ? t('modeFlow.courseResult.delete') : t('modeFlow.courseResult.deleteMin')}
            </Text>
          </TouchableOpacity>
    </ModalSurface>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: C.white,
    borderTopLeftRadius: DS.radius.modal,
    borderTopRightRadius: DS.radius.modal,
    paddingHorizontal: SP.screen,
    paddingTop: SP.md,
    paddingBottom: SP.xxl + SP.xs,
  },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: SP.md, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: SP.xs },
  rowDisabled: { opacity: 0.4 },
  rowText: { ...DS.typography.button, fontWeight: '600', color: C.text },
  rowTextDanger: { color: C.danger },
  rowTextDisabled: { color: C.textMuted },
});
