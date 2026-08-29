import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DS, SP } from '../constants/theme';
import { useI18n, type AppLanguage } from '../lib/i18n';

export function LanguageToggle() {
  const { language, setLanguage, strings } = useI18n();

  const options: { key: AppLanguage; label: string }[] = [
    { key: 'ko', label: strings.language.ko },
    { key: 'en', label: strings.language.en },
  ];

  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const active = language === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => setLanguage(option.key)}
            activeOpacity={0.88}
            style={[styles.button, active && styles.buttonActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.component.tightGap,
    alignSelf: 'flex-end',
  },
  button: {
    minWidth: 72,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: DS.radius.full,
    backgroundColor: DS.color.graySurface,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: DS.color.danger,
  },
  label: {
    ...DS.typography.bodySmall,
    fontWeight: '700',
    color: DS.color.coolGray,
  },
  labelActive: {
    color: DS.color.surface,
  },
});
