import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, DS, SP } from '../constants/theme';
import { REACTIONS, REACTION_ICONS, ReactionType } from '../lib/reactions';

export function ReactionPicker({
  selected,
  onSelect,
  labelFor,
}: {
  selected: ReactionType | null;
  onSelect: (type: ReactionType) => void;
  labelFor: (type: ReactionType) => string;
}) {
  return (
    <View style={s.grid}>
      {REACTIONS.map(r => {
        const isSel = selected === r.type;
        const Icon = REACTION_ICONS[r.type];
        return (
          <TouchableOpacity
            key={r.type}
            testID={`reaction-${r.type}${isSel ? '-selected' : ''}`}
            style={[
              s.btn,
              { backgroundColor: isSel ? r.bg : C.gray },
              isSel && s.btnSelected,
              isSel && { borderColor: r.color },
            ]}
            onPress={() => onSelect(r.type)}
            activeOpacity={0.88}
          >
            <Icon size={26} color={isSel ? r.color : C.textSub} strokeWidth={2} />
            <Text style={[s.label, isSel && s.labelSelected, isSel && { color: r.color }]}>
              {labelFor(r.type)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP.sm,
    marginBottom: SP.xxl,
  },
  btn: {
    width: '47%',
    borderRadius: DS.radius.input,
    paddingVertical: SP.lg,
    alignItems: 'center',
    gap: SP.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  btnSelected: { borderWidth: 2 },
  label: { ...DS.typography.body, color: C.textSub },
  labelSelected: { fontWeight: '700' },
});
