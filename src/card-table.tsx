import React, { useState, useEffect, useRef, MouseEvent } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useLocation } from 'react-router-dom';
import yaml from 'js-yaml';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ALWAYS_ON_TOP_Z_INDEX = 1000000;

interface Card {
  key: string;
  title: string;
  tags: string[];
  arxiv: string;
  website: string;
  github: string;
  notes: string;
  x: number;
  y: number;
  zIndex: number;
}

interface TextElement {
  id: number;
  content: string;
  x: number;
  y: number;
  isEditing: boolean;
  isSelected: boolean;
  color: string;
  fontSize: number;
  zIndex: number;
}

type DraggedItem = {
  item: Card | TextElement;
  type: 'card' | 'text';
  initialX: number;
  initialY: number;
};

interface TableData {
  title: string;
  texts: TextElement[];
  cards: Card[];
  zoom: number;
}

const TextEditor: React.FC<{
  text: TextElement;
  onTextChange: (id: number, newContent?: string, newColor?: string, newFontSize?: number) => void;
  onBlur: (id: number) => void;
}> = ({ text, onTextChange, onBlur }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent default behavior (new line)
      onBlur(text.id); // Trigger the onBlur function to indicate editing is done
    }
  };

  return (
    <input
      type="text"
      value={text.content}
      onChange={(e) => onTextChange(text.id, e.target.value)}
      onBlur={() => onBlur(text.id)}
      onKeyDown={handleKeyDown}
      autoFocus
      style={{
        width: '100%',
        border: '1px solid #ccc',
        padding: '5px',
        fontSize: `${text.fontSize}px`,
        color: text.color,
      }}
    />
  );
};

const TextControlPanel: React.FC<{
  text: TextElement;
  onTextChange: (id: number, newContent?: string, newColor?: string, newFontSize?: number) => void;
}> = ({ text, onTextChange }) => {

  return (
    <div 
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ 
        position: 'absolute', 
        top: '100%', 
        left: 0, 
        backgroundColor: 'white', 
        border: '1px solid #ccc', 
        padding: '5px',
        width: '150px',
        zIndex: ALWAYS_ON_TOP_Z_INDEX,
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label>
          Color:
          <input
            type="color"
            value={text.color}
            onChange={(e) => onTextChange(text.id, undefined, e.target.value)}
            style={{ cursor: 'pointer' }}
          />
        </label>
        <label>
          Font Size:
          <input
            type="number"
            value={text.fontSize}
            onChange={(e) => onTextChange(text.id, undefined, undefined, Number(e.target.value))}
            style={{ width: '40px', fontSize: '22px' }}
            min="8"
            max="72"
          />
        </label>
      </div>
    </div>
  );
};

const CardTable: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tableUrl = searchParams.get('table');
  const cardsUrl = searchParams.get('cards');

  // Reload cards act differently depending on the app state
  const [appState, setAppState] = useState<'deployed' | 'dev' | 'reset'>(() => {
    return process.env.NODE_ENV === 'production' ? 'deployed' : 'dev';
  });

  // These are the default table file if not specified in the URL
  // dev mode: use table file to load, use card file when reloading
  // deployed mode: disable reload cards, show the default table, 
  const TABLE_FILE = tableUrl || './table_data.json';

  let CARDS_FILE = cardsUrl || './cards.yaml';
  // let CARDS_FILE = cardsUrl || 'src/test_test.yaml';
  if (appState === 'deployed' && !cardsUrl) {
    CARDS_FILE = '';
  }

  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [texts, setTexts] = useState<TextElement[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [title, setTitle] = useState<string>("Title");
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [deleteAlertOpen, setDeleteAlertOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: Card | TextElement, type: 'card' | 'text' } | null>(null);
  const [resetAlertOpen, setResetAlertOpen] = useState<boolean>(false);
  const [maxZIndex, setMaxZIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const initTableFromJson = (tableData: TableData) => {
    try {
      setTitle(tableData.title);
      setTexts(tableData.texts.map((text: TextElement) => ({
        ...text,
        color: text.color || '#000000',
        fontSize: text.fontSize || 24,
      })));
      setCards(tableData.cards);
      const maxExistingZIndex = Math.max(
        ...tableData.cards.map((card: Card) => card.zIndex),
        ...tableData.texts.map((text: TextElement) => text.zIndex || 0),
        0
      );
      const newMaxZIndex = Math.max(maxExistingZIndex, tableData.cards.length + tableData.texts.length);
      setMaxZIndex(newMaxZIndex);
      setZoom(tableData.zoom);
      console.log('Table loaded successfully');
    } catch (error) {
      console.error('Error parsing JSON:', error);
      // You might want to show an error message to the user here
    }
  };

  const initTableWithCardsOnly = (cardsYaml: string) => {

    const yamlData = yaml.load(cardsYaml);
     
    const newCards: Card[] = Object.entries(yamlData).map(([key, value]: [string, any], index) => ({
      key: key,
      title: value.title,
      tags: value.tags,
      arxiv: value.arxiv,
      website: value.website,
      github: value.github,
      notes: value.notes,
      x: Math.floor(Math.random() * 300) + 10,
      y: Math.floor(Math.random() * 300) + 10,
      zIndex: index + 1
    }));
    
    setCards(newCards);
    setMaxZIndex(newCards.length);

    setTitle("New Table");
    setTexts([]);
    setZoom(1);
    setSelectedCard(null);
  };

  const loadTableFromFile = async (tableFile: string) => {
    try {
      const response = await fetch(tableFile);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const fileContent = await response.text();
      const tableData = JSON.parse(fileContent);
      initTableFromJson(tableData);
    } catch (error) {
      console.error('Error loading table from file:', error);
    }
  };

  const loadCardsFromYAML = async (cardsFile: string) => {
    try {
      const response = await fetch(cardsFile);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const yamlText = await response.text();
      initTableWithCardsOnly(yamlText);
    } catch (error) {
      console.error('Error loading cards from YAML:', error);
    }
  };

  useEffect(() => {
    if (appState === 'deployed' && CARDS_FILE) {
      loadCardsFromYAML(CARDS_FILE);
      console.log("Table initialized with cards from file:", CARDS_FILE);
    } else {
      loadTableFromFile(TABLE_FILE);
      console.log("Table initialized with the table file:", TABLE_FILE);
    }
  }, [appState]);

  const handleLoadTable = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
  
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const tableData = JSON.parse(event.target?.result as string);
          initTableFromJson(tableData);
        };
        reader.readAsText(file);
      }
    };
  
    input.click();
  };

  const handleAddText = (): void => {
    const newZIndex = maxZIndex + 1;
    const newText: TextElement = {
      id: Date.now(),
      content: 'New Text',
      x: 50,
      y: 50,
      isEditing: false,
      isSelected: false,
      color: '#000000',
      fontSize: 24,
      zIndex: newZIndex
    };
    setTexts([...texts, newText]);
    setMaxZIndex(newZIndex);
  };

  const handleReloadCards = async (): Promise<void> => {
    if (appState === 'dev' && CARDS_FILE) {
      try {
        const response = await fetch(CARDS_FILE);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const yamlText = await response.text();
        const yamlData = yaml.load(yamlText);
  
        // Create a map of existing cards for efficient lookup and update
        const existingCardsMap = new Map(cards.map(card => [card.key, card]));

        // Update existing cards and create new ones
        const updatedCards: Card[] = Object.entries(yamlData).map(([key, value]: [string, any], index) => {
          if (existingCardsMap.has(key)) {
            // Update existing card
            const existingCard = existingCardsMap.get(key)!;
            return {
              ...existingCard,
              title: value.title,
              tags: value.tags,
              arxiv: value.arxiv,
              website: value.website,
              github: value.github,
              notes: value.notes,
            };
          } else {
            // Create new card
            return {
              key: key,
              title: value.title,
              tags: value.tags,
              arxiv: value.arxiv,
              website: value.website,
              github: value.github,
              notes: value.notes,
              x: (index % 5) * 120 + 10,
              y: Math.floor(index / 5) * 120 + 10,
              zIndex: maxZIndex + index + 1
            };
          }
        });

        // Update the cards state
        setCards(updatedCards);

        // Update maxZIndex if necessary
        const newMaxZIndex = Math.max(...updatedCards.map(card => card.zIndex));
        if (newMaxZIndex > maxZIndex) {
          setMaxZIndex(newMaxZIndex);
        }  
        console.log('Cards reloaded successfully');
      } catch (error) {
        console.error('Error reloading cards:', error);
      }
    }
  };

  const handleSaveTable = (): void => {
    const tableData = {
      title: title,
      texts: texts,
      cards: cards,
      zoom: zoom
    };
  
    const jsonData = JSON.stringify(tableData, null, 2);
  
    // Create a Blob with the JSON data
    const blob = new Blob([jsonData], { type: 'application/json' });
  
    // Create a link element and trigger the download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'table_data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  
    console.log('Table saved successfully');
  };

  const handleResetTableWithCards = (): void => {
    setResetAlertOpen(true);
  };

  const handleConfirmReset = async (): Promise<void> => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.yaml,.yml';
  
      // Create a promise to handle the file selection
      const fileSelected = new Promise<File | null>((resolve) => {
        input.onchange = (event) => {
          const file = (event.target as HTMLInputElement).files?.[0] || null;
          resolve(file);
        };
      });
  
      // Trigger the file dialog
      input.click();
  
      // Wait for file selection
      const selectedFile = await fileSelected;
  
      if (selectedFile) {
        const yamlText = await selectedFile.text();
        initTableWithCardsOnly(yamlText);
        setAppState('reset');
        console.log('Table reset successfully with new cards file');
      } else {
        console.log('No file selected, reset cancelled');
      }
    } catch (error) {
      console.error('Error resetting table:', error);
    }
    setResetAlertOpen(false);
  };

  const handleCardClick = (card: Card): void => {
    setTexts(texts.map(text => ({ ...text, isSelected: false })));
    if (card.zIndex < maxZIndex) {
      setCards(cards.map(c => 
        c.key === card.key ? { ...c, zIndex: maxZIndex + 1 } : c
      ));
      setMaxZIndex(maxZIndex + 1);
    }
    setSelectedCard(card);
  };

  const handleRemoveCard = (cardToRemove: Card): void => {
    const cardKey = cardToRemove.key;
    setCards(cards.filter(card => card.key !== cardKey));
    if (selectedCard && selectedCard.key === cardKey) {
      setSelectedCard(null);
    }
  };

  const handleRemoveText = (textToRemove: TextElement): void => {
    setTexts(texts.filter(text => text.id !== textToRemove.id));
  };

  const handleDeleteClick = (item: Card | TextElement, type: 'card' | 'text'): void => {
    setItemToDelete({ item, type });
    setDeleteAlertOpen(true);
  };

  const handleConfirmDelete = (): void => {
    if (itemToDelete) {
      if (itemToDelete.type === 'card') {
        handleRemoveCard(itemToDelete.item as Card);
      } else {
        handleRemoveText(itemToDelete.item as TextElement);
      }
    }
    setDeleteAlertOpen(false);
    setItemToDelete(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(prevZoom => Math.max(0.5, Math.min(2, prevZoom - e.deltaY * 0.01)));
    }
  };

  const handleZoomIn = (): void => {
    setZoom(prevZoom => Math.min(2, prevZoom + 0.1));
  };

  const handleZoomOut = (): void => {
    setZoom(prevZoom => Math.max(0.5, prevZoom - 0.1));
  };

  const handleMouseDown = (e: MouseEvent, item: Card | TextElement, type: 'card' | 'text'): void => {
    if (e.button !== 0) return;
    if (type === 'text' && !(item as TextElement).isSelected) return;
    setIsDragging(true);
    setDraggedItem({ item, type, initialX: e.clientX, initialY: e.clientY });
    if (type === 'card') {
      handleCardClick(item as Card);
    }
  };

  const handleMouseMove = (e: MouseEvent): void => {
    if (!isDragging || !draggedItem) return;
    const dx = (e.clientX - draggedItem.initialX) / zoom;
    const dy = (e.clientY - draggedItem.initialY) / zoom;
    
    if (draggedItem.type === 'card') {
      const draggedCard = draggedItem.item as Card;
      setCards(cards.map(card => 
        card.key === draggedCard.key
          ? { ...card, x: draggedCard.x + dx, y: draggedCard.y + dy }
          : card
      ));
    } else if (draggedItem.type === 'text') {
      const draggedText = draggedItem.item as TextElement;
      setTexts(texts.map(text => 
        text.id === draggedText.id
          ? { ...text, x: draggedText.x + dx, y: draggedText.y + dy }
          : text
      ));
    }
  };

  const handleMouseUp = (): void => {
    setIsDragging(false);
    setDraggedItem(null);
  };

  const handleTextChange = (id: number, newContent?: string, newColor?: string, newFontSize?: number): void => {
    console.log("handleTextChange", id, newContent, newColor, newFontSize);
    setTexts(texts.map(text => 
      text.id === id 
        ? { 
            ...text, 
            ...(newContent !== undefined && { content: newContent }),
            ...(newColor !== undefined && { color: newColor }),
            ...(newFontSize !== undefined && { fontSize: newFontSize })
          }
        : text
    ));
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if the click is directly on the container and not on any of its children
    if (e.target === e.currentTarget) {
      // Unselect all texts
      setTexts(texts.map(text => ({ ...text, isSelected: false, isEditing: false })));
      // Optionally, you might want to unselect cards as well
      setSelectedCard(null);
    }
  };

  const handleTextClick = (e: React.MouseEvent, id: number): void => {
    e.stopPropagation();
    const currentZIndex = texts.find(text => text.id === id)?.zIndex;
    if (currentZIndex === undefined || currentZIndex < maxZIndex) {
      setTexts(texts.map(text => 
        text.id === id 
          ? { ...text, isSelected: true, zIndex: maxZIndex + 1 }
          : { ...text, isSelected: false }
      ));
      setMaxZIndex(maxZIndex + 1);
    }
    else {
      setTexts(texts.map(text => 
        text.id === id 
          ? { ...text, isSelected: true }
          : { ...text, isSelected: false }
      ));
    }
  };

  const handleTextDoubleClick = (id: number): void => {
    setTexts(texts.map(text => 
      text.id === id ? { ...text, isEditing: true, isSelected: true } : { ...text, isSelected: false }
    ));
  };

  const handleTextBlur = (id: number): void => {
    setTexts(texts.map(text => 
      text.id === id ? { ...text, isEditing: false, isSelected: true } : text
    ));
  };

  const renderCardContent = (card: Card) => {
    return (
      <>
        <p><strong>{card.title}</strong></p>
        <p>&#x1F517;&nbsp;
          {card.website && card.website.startsWith('http') && (
            <a href={card.website} target="_blank" rel="noreferrer">[Website] </a>
          )}
          {card.arxiv && card.arxiv.startsWith('http') && (
            <a href={card.arxiv} target="_blank" rel="noreferrer">[ArXiv] </a>
          )}
          {card.github && card.github.startsWith('http') && (
            <a href={card.github} target="_blank" rel="noreferrer">[GitHub]</a>
          )}
        </p>
        <p>&#x1F3F7;&#xFE0F; {card.tags.join(', ')}</p>
        <p>&#128073; {card.notes}</p>
      </>
    );
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <div style={{ 
        marginBottom: '10px', 
        position: 'sticky', 
        top: 0, 
        zIndex: ALWAYS_ON_TOP_Z_INDEX, 
        backgroundColor: 'white', 
        padding: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button onClick={handleLoadTable} style={{ marginRight: '10px' }}>Load table</Button>
          <Button onClick={handleAddText} style={{ marginRight: '10px' }}>Add text</Button>
          {appState === 'dev' && (
            <Button onClick={handleReloadCards} style={{ marginRight: '10px' }}>
              Reload cards
            </Button>
          )}
          <Button onClick={handleSaveTable} style={{ marginRight: '10px' }}>Save table</Button>
          <Button onClick={handleZoomOut} style={{ marginRight: '10px' }}><ZoomOut size={16} /></Button>
          <Button onClick={handleZoomIn}><ZoomIn size={16} /></Button>
        </div>
        <div>
          <Button onClick={handleResetTableWithCards}>Reset table with new cards</Button>
        </div>
      </div>
      {isEditingTitle ? (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setIsEditingTitle(false)}
          onKeyPress={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
          autoFocus
          style={{
            fontSize: '30px',
            fontWeight: 'bold',
            border: 'none',
            borderBottom: '1px solid #ccc',
            marginBottom: '10px',
            marginLeft: '10px',
            padding: '5px',
          }}
        />
      ) : (
        <h1 
          onDoubleClick={() => setIsEditingTitle(true)}
          style={{ 
            fontSize: '30px', 
            fontWeight: 'bold', 
            marginBottom: '10px', 
            marginLeft: '10px',
            cursor: 'pointer',
          }}
        >
          {title}
        </h1>
      )}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
        onClick={handleContainerClick}
        style={{ 
          position: 'relative', 
          transform: `scale(${zoom})`, 
          transformOrigin: 'top left',
          height: 'calc(160% - 20px)',
          width: `${100 / zoom}%`,
          border: '1px solid #ccc',
          overflow: 'auto'
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <TooltipProvider>
          {cards.map(card => (
            <Tooltip key={card.key}>
              <TooltipTrigger asChild>
                <div 
                  onClick={() => handleCardClick(card)}
                  onMouseDown={(e) => handleMouseDown(e, card, 'card')}
                  style={{ 
                    position: 'absolute',
                    left: card.x,
                    top: card.y,
                    width: 135,
                    height: 50,
                    border: '1px solid black',
                    backgroundColor: 'white',
                    cursor: 'move',
                    userSelect: 'none',
                    zIndex: card.zIndex,
                  }}
                >
                  <div style={{ padding: '5px' }}>{card.key}</div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(card, 'card'); }}
                    style={{ position: 'absolute', top: 0, right: 0 }}
                  >
                    <X size={16} />
                  </Button>
                  {/* <Move size={16} style={{ position: 'absolute', bottom: 5, right: 5 }} /> */}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" style={{ maxWidth: '300px', zIndex: ALWAYS_ON_TOP_Z_INDEX }}>
                {renderCardContent(card)}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
          {texts.map(text => (
          <div
            key={text.id}
            onClick={(e) => handleTextClick(e, text.id)}
            onMouseDown={(e) => handleMouseDown(e, text, 'text')}
            onDoubleClick={() => handleTextDoubleClick(text.id)}
            style={{
              position: 'absolute',
              left: text.x,
              top: text.y,
              minWidth: 150,
              minHeight: 30,
              padding: '5px 25px 5px 5px',
              border: text.isSelected ? '1px dashed #999' : 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              cursor: text.isSelected ? 'move' : 'pointer',
              userSelect: 'none',
              zIndex: text.zIndex,
            }}
          >
            {text.isEditing ? (
              <TextEditor
                text={text}
                onTextChange={handleTextChange}
                onBlur={handleTextBlur}
              />
            ) : (
              <span 
                style={{ 
                  color: text.color, 
                  fontSize: `${text.fontSize}px`,
                }}
              >
                <strong>{text.content}</strong>
              </span>
            )}
            {text.isSelected && !text.isEditing && (
              <TextControlPanel
                text={text}
                onTextChange={handleTextChange}
              />
            )}
            {text.isSelected && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(text, 'text'); }}
                style={{ position: 'absolute', top: 0, right: 0 }}
              >
                <X size={16} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: 'fixed', top: 70, right: 10, width: 300, backgroundColor: 'white', padding: 10, border: '1px solid #ccc' }}>
        {selectedCard ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 20, margin: 0 }}>{selectedCard.key}</h2>
              <button 
                onClick={() => setSelectedCard(null)} 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  fontSize: 20, 
                  color: '#888' 
                }}
              >
                ×
              </button>
            </div>
            {renderCardContent(selectedCard)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#888' }}>
            Click a card to see details
          </div>
        )}
      </div>
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: '5px 10px',
        borderRadius: '5px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        zIndex: ALWAYS_ON_TOP_Z_INDEX,
      }}>
        Dealt with <a href='https://github.com/kywch/card-table' target='_blank'>&#x1F3B4;Card Table</a>
      </div>
      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={resetAlertOpen} onOpenChange={setResetAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Table</AlertDialogTitle>
          </AlertDialogHeader>
          <div>Are you sure you want to reset the table? This will remove all existing cards and texts, and load new cards from the file.</div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetAlertOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CardTable;