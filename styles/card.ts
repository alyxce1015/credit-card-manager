import { StyleSheet } from 'react-native';

export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F4EDE4',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CBB9A8',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 14,
    shadowColor: '#2B1D17',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },
  cardSelected: {
    borderColor: '#C08A5B',
    backgroundColor: 'rgba(192,138,91,0.08)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#8C6E5A',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: '#C08A5B',
    borderColor: '#C08A5B',
  },
  trashButton: {
    alignSelf: 'flex-end',
    paddingBottom: 2,
    paddingLeft: 4,
  },

  cardImageColumn: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 3,
  },
  cardImageWrap: {
    width: 90,
    height: 57,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  cardDateOpenedLabel: {
    fontSize: 9,
    color: '#8C6E5A',
    fontWeight: '500',
    textAlign: 'center',
  },
  cardAgeLabel: {
    fontSize: 9,
    color: '#CBB9A8',
    textAlign: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  customCardLabel: {
    color: '#F8F4EF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 4,
  },

  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 5,
  },
  cardNameRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2A211C',
  },
  cardNameDesktop: {
    flex: 1,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  feeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6d4c2f',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  feeBadgeUrgent: {
    backgroundColor: 'rgba(139,58,58,0.12)',
    borderWidth: 1,
    borderColor: '#ff3b30',
  },
  feeBadgeText: {
    color: '#F8F4EF',
    fontSize: 11,
    fontWeight: '700',
  },
  feeBadgeTextUrgent: {
    color: '#ff3b30',
  },
  cardLast4: {
    fontSize: 12,
    color: '#8C6E5A',
  },

  noFeePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(122,158,126,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  noFeePillText: {
    color: '#7A9E7E',
    fontSize: 12,
    fontWeight: '600',
  },

  renewalSection: {
    marginTop: 4,
    gap: 4,
  },
  renewalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  renewalLabel: {
    fontSize: 11,
    color: '#8C6E5A',
  },
  daysText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2A211C',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#D4BBA8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#C08A5B',
    borderRadius: 2,
  },
  progressFillUrgent: {
    backgroundColor: '#ff3b30',
  },
  daysTextUrgent: {
    color: '#ff3b30',
  },
  progressFeeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2A211C',
    flexShrink: 0,
  },
  renewalDateText: {
    fontSize: 11,
    color: '#8C6E5A',
  },
  setDateHint: {
    fontSize: 11,
    color: '#CBB9A8',
    marginTop: 2,
    fontStyle: 'italic',
  },
  cardOpenedText: {
    fontSize: 11,
    color: '#8C6E5A',
    marginTop: 2,
  },

  benefitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  benefitChip: {
    backgroundColor: '#EDE1D4',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  benefitChipText: {
    fontSize: 12,
    color: '#6F4E37',
    fontWeight: '500',
  },
});
