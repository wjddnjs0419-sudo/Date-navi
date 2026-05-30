import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
            activeOpacity={0.8}
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
    gap: 6,
    alignSelf: 'flex-end',
  },
  button: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#FF4F6D',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  labelActive: {
    color: '#fff',
  },
});
