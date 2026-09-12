import { useState, useMemo } from 'react'
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'

const PACKING_TEMPLATES: { category: string; items: string[] }[] = [
  {
    category: '重要證件',
    items: [
      '護照正本 (效期 6 個月以上)',
      '機票 / 電子登機證憑證',
      '飯店住宿確認單',
      '外幣現金與常用信用卡',
      '護照影本與大頭照 (備用)',
      '海外旅遊平安保險單',
    ],
  },
  {
    category: '3C 與電子',
    items: [
      '手機充電線與充電頭',
      '行動電源 (需放隨身行李)',
      '萬國轉接插頭 / 變壓器',
      '國外上網卡 / eSIM 憑證',
      '降噪耳機',
    ],
  },
  {
    category: '常備藥品',
    items: [
      '綜合感冒藥',
      '止痛 / 退燒藥',
      '腸胃 / 止瀉藥',
      '暈車 / 暈機藥',
      'OK繃與隨身外傷藥膏',
      '個人慢箋處方藥',
    ],
  },
  {
    category: '衣物與日用品',
    items: [
      '換洗衣物與貼身衣物',
      '薄外套 / 防風保暖外套',
      '舒適好走耐走鞋',
      '折疊輕便晴雨傘',
      '防曬乳與個人保養品',
      '隨身面紙與消毒濕紙巾',
    ],
  },
  {
    category: '機上舒適',
    items: [
      '充氣旅行頸枕',
      '睡眠眼罩與耳塞',
      '保濕護唇膏',
      '原子筆 (方便機上填入境卡)',
    ],
  },
]

interface TodoPackingTemplatesDialogProps {
  open: boolean
  onClose: () => void
  onImport: (items: { title: string; category: string }[]) => void
}

export function TodoPackingTemplatesDialog({
  open,
  onClose,
  onImport,
}: TodoPackingTemplatesDialogProps) {
  // Key format: `${category}:::${item}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    // By default, pre-select important documents and essential 3C
    PACKING_TEMPLATES.slice(0, 2).forEach((cat) => {
      cat.items.forEach((item) => initial.add(`${cat.category}:::${item}`))
    })
    return initial
  })

  const allKeys = useMemo(() => {
    const set = new Set<string>()
    PACKING_TEMPLATES.forEach((cat) => {
      cat.items.forEach((item) => set.add(`${cat.category}:::${item}`))
    })
    return set
  }, [])

  const handleToggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleToggleCategory = (category: string, items: string[]) => {
    const categoryKeys = items.map((it) => `${category}:::${it}`)
    const allSelected = categoryKeys.every((k) => selectedKeys.has(k))

    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        categoryKeys.forEach((k) => next.delete(k))
      } else {
        categoryKeys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedKeys(new Set(allKeys))
  }

  const handleDeselectAll = () => {
    setSelectedKeys(new Set())
  }

  const handleApply = () => {
    const itemsToImport: { title: string; category: string }[] = []
    selectedKeys.forEach((key) => {
      const [category, title] = key.split(':::')
      if (category && title) {
        itemsToImport.push({ category, title })
      }
    })
    onImport(itemsToImport)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <PlaylistAddCheckRoundedIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            常備旅行打包清單範本
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
        >
          <Typography variant="body2" color="text.secondary">
            勾選需要的準備項目，一鍵快速匯入待辦清單：
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={handleSelectAll}>
              全選
            </Button>
            <Button size="small" color="inherit" onClick={handleDeselectAll}>
              全部取消
            </Button>
          </Stack>
        </Stack>

        <Stack spacing={1}>
          {PACKING_TEMPLATES.map((group) => {
            const groupKeys = group.items.map((it) => `${group.category}:::${it}`)
            const selectedCount = groupKeys.filter((k) => selectedKeys.has(k)).length
            const isAllGroupSelected = selectedCount === group.items.length
            const isIndeterminate = selectedCount > 0 && selectedCount < group.items.length

            return (
              <Accordion
                key={group.category}
                defaultExpanded
                disableGutters
                variant="outlined"
                sx={{
                  borderRadius: '10px !important',
                  overflow: 'hidden',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreRoundedIcon />}
                  sx={{
                    bgcolor: 'action.hover',
                    minHeight: 48,
                    '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' },
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={isAllGroupSelected}
                        indeterminate={isIndeterminate}
                        onChange={() => handleToggleCategory(group.category, group.items)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                    label={
                      <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>
                        {group.category} ({selectedCount}/{group.items.length})
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 1, pb: 1.5 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 0.5,
                    }}
                  >
                    {group.items.map((item) => {
                      const key = `${group.category}:::${item}`
                      const isChecked = selectedKeys.has(key)
                      return (
                        <FormControlLabel
                          key={item}
                          control={
                            <Checkbox
                              size="small"
                              checked={isChecked}
                              onChange={() => handleToggleItem(key)}
                            />
                          }
                          label={
                            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                              {item}
                            </Typography>
                          }
                          sx={{ m: 0, py: 0.25 }}
                        />
                      )
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )
          })}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={selectedKeys.size === 0}
          onClick={handleApply}
        >
          匯入選取的項目 ({selectedKeys.size})
        </Button>
      </DialogActions>
    </Dialog>
  )
}
