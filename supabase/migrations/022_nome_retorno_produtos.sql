-- Migration 022: Add nome_retorno column to produtos table
-- Data: 09/02/2026
-- Descrição: Adiciona coluna nome_retorno para exibição abreviada de produtos
--            no protocolo de retorno. Popula com valores do NOME_RETORNO_MAP
--            do frontend para manter consistência.

-- Adiciona coluna nome_retorno (texto, opcional)
ALTER TABLE produtos ADD COLUMN nome_retorno TEXT DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN produtos.nome_retorno IS 'Nome abreviado do produto para exibição no protocolo de retorno. Se NULL, usa o nome completo.';

-- Popula nome_retorno para todos os produtos mapeados
-- Especiais / Inclusos
UPDATE produtos SET nome_retorno = 'Sem Urna' WHERE nome = 'Nenhuma Urna';
UPDATE produtos SET nome_retorno = 'Sem Rescaldo' WHERE nome = 'Nenhum Rescaldo';
UPDATE produtos SET nome_retorno = 'Molde Patinha' WHERE nome = 'Molde de Patinha';
UPDATE produtos SET nome_retorno = 'Pelinho' WHERE nome = 'Pelinho';
UPDATE produtos SET nome_retorno = 'Certificado' WHERE nome = 'Certificado de Cremação';
UPDATE produtos SET nome_retorno = 'Protocolo' WHERE nome = 'Protocolo de Retorno';
UPDATE produtos SET nome_retorno = 'Pelo Extra' WHERE nome = 'Pelo Extra';
UPDATE produtos SET nome_retorno = 'Itens Pessoais' WHERE nome = 'Retorno de Itens Pessoais';

-- Urnas Plano (inclusas) - Página 1
UPDATE produtos SET nome_retorno = 'MDF Peq.' WHERE nome = 'MDF Pequena';
UPDATE produtos SET nome_retorno = 'MDF Gde.' WHERE nome = 'MDF Grande';
UPDATE produtos SET nome_retorno = 'Cach. Branco' WHERE nome = 'Cachorrinho Plano - Branco';
UPDATE produtos SET nome_retorno = 'Cach. Marrom' WHERE nome = 'Cachorrinho Plano - Marrom Escuro';
UPDATE produtos SET nome_retorno = 'Cach. Caramelo' WHERE nome = 'Cachorrinho Plano - Caramelo';
UPDATE produtos SET nome_retorno = 'Cach. Preto' WHERE nome = 'Cachorrinho Plano - Preto';
UPDATE produtos SET nome_retorno = 'Novelo Branco' WHERE nome = 'Novelo Plano - Branco';
UPDATE produtos SET nome_retorno = 'Novelo Azul' WHERE nome = 'Novelo Plano - Azul';
UPDATE produtos SET nome_retorno = 'Novelo Rosa' WHERE nome = 'Novelo Plano - Rosa';
UPDATE produtos SET nome_retorno = 'Gat. Branco' WHERE nome = 'Gatinho Plano - Branco';
UPDATE produtos SET nome_retorno = 'Gat. Preto' WHERE nome = 'Gatinho Plano - Preto';
UPDATE produtos SET nome_retorno = 'Coração Azul' WHERE nome = 'Coraçãozinho Plano - Azul';
UPDATE produtos SET nome_retorno = 'Coração Branco' WHERE nome = 'Coraçãozinho Plano - Branco';
UPDATE produtos SET nome_retorno = 'Coração Vermelho' WHERE nome = 'Coraçãozinho Plano - Vermelho';
UPDATE produtos SET nome_retorno = 'Coração Rosa' WHERE nome = 'Coraçãozinho Plano - Rosa';

-- Urnas Plano - Página 2
UPDATE produtos SET nome_retorno = 'Dog Heart' WHERE nome = 'Dog Heart - Plano';
UPDATE produtos SET nome_retorno = 'Cat Heart' WHERE nome = 'Cat Heart - Plano';
UPDATE produtos SET nome_retorno = 'Casinha Branca' WHERE nome = 'Casinha com Plaquinha Branca - Plano';
UPDATE produtos SET nome_retorno = 'Casinha Amarela' WHERE nome = 'Casinha com Plaquinha Amarela - Plano';
UPDATE produtos SET nome_retorno = 'Biourna' WHERE nome = 'Biourna com Sementes  - Plano';
UPDATE produtos SET nome_retorno = 'Biourna Gina' WHERE nome = 'Biourna com Sementes Gina  - Plano';

-- Urnas Avulsas - Página 3
UPDATE produtos SET nome_retorno = 'Urna 2 Fotos' WHERE nome = 'Urna com 2 fotos';
UPDATE produtos SET nome_retorno = 'MDF Foto/Alça' WHERE nome = 'MDF com Foto e Alça';
UPDATE produtos SET nome_retorno = 'Biourna Avulsa' WHERE nome = 'Biourna com Sementes - Avulso';
UPDATE produtos SET nome_retorno = 'MDF Branca' WHERE nome = 'MDF Branca';
UPDATE produtos SET nome_retorno = 'MDF Rosa' WHERE nome = 'MDF Rosa';
UPDATE produtos SET nome_retorno = 'MDF Azul' WHERE nome = 'MDF Azul';
UPDATE produtos SET nome_retorno = 'MDF Verde' WHERE nome = 'MDF Verde';
UPDATE produtos SET nome_retorno = 'S. Francisco Branca' WHERE nome = 'São Francisco Branca';
UPDATE produtos SET nome_retorno = 'S. Francisco Rosa' WHERE nome = 'São Francisco Rosa';
UPDATE produtos SET nome_retorno = 'S. Francisco Azul' WHERE nome = 'São Francisco Azul';
UPDATE produtos SET nome_retorno = 'S. Francisco Verde' WHERE nome = 'São Francisco Verde';

-- Porta-Retrato - Página 4
UPDATE produtos SET nome_retorno = 'Porta-Ret. Branca' WHERE nome = 'Urna Porta-Retrato Branca';
UPDATE produtos SET nome_retorno = 'Porta-Ret. Castanho' WHERE nome = 'Urna Porta-Retrato Castanho';
UPDATE produtos SET nome_retorno = 'Porta-Ret. Preta' WHERE nome = 'Urna Porta-Retrato Preta';

-- Sleeping - Página 5
UPDATE produtos SET nome_retorno = 'Dog Sleep. Ouro' WHERE nome = 'Dog Sleeping Ouro';
UPDATE produtos SET nome_retorno = 'Dog Sleep. Branca' WHERE nome = 'Dog Sleeping Branca';
UPDATE produtos SET nome_retorno = 'Dog Sleep. Cobre' WHERE nome = 'Dog Sleeping Cobre';
UPDATE produtos SET nome_retorno = 'Dog Sleep. Prata' WHERE nome = 'Dog Sleeping Prata';
UPDATE produtos SET nome_retorno = 'Cat Sleep. Ouro' WHERE nome = 'Cat Sleeping Ouro';
UPDATE produtos SET nome_retorno = 'Cat Sleep. Cobre' WHERE nome = 'Cat Sleeping Cobre';
UPDATE produtos SET nome_retorno = 'Cat Sleep. Branca' WHERE nome = 'Cat Sleeping Branca';
UPDATE produtos SET nome_retorno = 'Cat Sleep. Prata' WHERE nome = 'Cat Sleeping Prata';

-- Resina - Página 6
UPDATE produtos SET nome_retorno = 'Arca Branca' WHERE nome = 'Arca Resina Branca';
UPDATE produtos SET nome_retorno = 'Arca Dourada' WHERE nome = 'Arca Resina Dourada';
UPDATE produtos SET nome_retorno = 'Arca Azul' WHERE nome = 'Arca Resina Azul';
UPDATE produtos SET nome_retorno = 'Tower Verde' WHERE nome = 'Tower Verde Resina';
UPDATE produtos SET nome_retorno = 'Tower Branca' WHERE nome = 'Tower Branca Resina';
UPDATE produtos SET nome_retorno = 'Tower Azul' WHERE nome = 'Tower Azul Resina';
UPDATE produtos SET nome_retorno = 'Arca Luxo Ouro' WHERE nome = 'Arca Luxo Resina Ouro';
UPDATE produtos SET nome_retorno = 'Arca Luxo Branca' WHERE nome = 'Arca Luxo Resina Branca';
UPDATE produtos SET nome_retorno = 'Arca Luxo Azul' WHERE nome = 'Arca Luxo Resina Azul';
UPDATE produtos SET nome_retorno = 'Dog Heart Avulso' WHERE nome = 'Dog Heart - Avulso';
UPDATE produtos SET nome_retorno = 'Imperial P' WHERE nome = 'Urna Imperial P';
UPDATE produtos SET nome_retorno = 'Cat Heart Avulso' WHERE nome = 'Cat Heart - Avulso';
UPDATE produtos SET nome_retorno = 'Imperial M' WHERE nome = 'Urna Imperial M';

-- Cestinha - Página 7
UPDATE produtos SET nome_retorno = 'Cest. Cão Prata' WHERE nome = 'Cestinha Cão Prata';
UPDATE produtos SET nome_retorno = 'Cest. Cão Cobre' WHERE nome = 'Cestinha Cão Cobre';
UPDATE produtos SET nome_retorno = 'Cest. Cão Ouro' WHERE nome = 'Cestinha Cão Ouro';
UPDATE produtos SET nome_retorno = 'Cest. Gato Prata' WHERE nome = 'Cestinha Gato Prata';
UPDATE produtos SET nome_retorno = 'Cest. Gato Cobre' WHERE nome = 'Cestinha Gato Cobre';
UPDATE produtos SET nome_retorno = 'Cest. Gato Ouro' WHERE nome = 'Cestinha Gato Ouro';

-- Avulsos Legado - Página 8
UPDATE produtos SET nome_retorno = 'Coração Dourado' WHERE nome = 'Coração Dourado';
UPDATE produtos SET nome_retorno = 'Coração c/ Vela' WHERE nome = 'Coração Dourado com Vela';
UPDATE produtos SET nome_retorno = 'Roma Branca' WHERE nome = 'Urna Roma Sem Foto Branca';
UPDATE produtos SET nome_retorno = 'Roma Bronze' WHERE nome = 'Urna Roma Sem Foto Bronze';
UPDATE produtos SET nome_retorno = 'Gato Deit. Cobre' WHERE nome = 'Gato Deitado Cobre';
UPDATE produtos SET nome_retorno = 'Gato Deit. Branco' WHERE nome = 'Gato Deitado Branco';
UPDATE produtos SET nome_retorno = 'Gato Deit. Marrom' WHERE nome = 'Gato Deitado Marrom';
UPDATE produtos SET nome_retorno = 'Lovecat Branco' WHERE nome = 'Lovecat Branco';
UPDATE produtos SET nome_retorno = 'Lovecat Preto' WHERE nome = 'Lovecat Preto';
UPDATE produtos SET nome_retorno = 'Gat. Av. Branco' WHERE nome = 'Gatinho Avulso - Branco';
UPDATE produtos SET nome_retorno = 'Gat. Av. Preto' WHERE nome = 'Gatinho Avulso - Preto';
UPDATE produtos SET nome_retorno = 'Cach. Av. Branco' WHERE nome = 'Cachorrinho Avulso - Branco';
UPDATE produtos SET nome_retorno = 'Cach. Av. Marrom' WHERE nome = 'Cachorrinho Avulso - Marrom Escuro';
UPDATE produtos SET nome_retorno = 'Cach. Av. Caramelo' WHERE nome = 'Cachorrinho Avulso - Caramelo';
UPDATE produtos SET nome_retorno = 'Cach. Av. Preto' WHERE nome = 'Cachorrinho Avulso - Preto';
UPDATE produtos SET nome_retorno = 'Novelo Av. Branco' WHERE nome = 'Novelo Avulso - Branco';
UPDATE produtos SET nome_retorno = 'Novelo Av. Azul' WHERE nome = 'Novelo Avulso - Azul';
UPDATE produtos SET nome_retorno = 'Novelo Av. Rosa' WHERE nome = 'Novelo Avulso - Rosa';
UPDATE produtos SET nome_retorno = 'Casinha Av. Branca' WHERE nome = 'Casinha com Plaquinha Branca - Avulso';
UPDATE produtos SET nome_retorno = 'Casinha Av. Amarela' WHERE nome = 'Casinha com Plaquinha Amarela - Avulso';

-- Anjo Cestinha - Página 9
UPDATE produtos SET nome_retorno = 'Cão Anjo Color' WHERE nome = 'Cão Anjo Cestinha Color';
UPDATE produtos SET nome_retorno = 'Cão Anjo Bronze' WHERE nome = 'Cão Anjo Cestinha Bronze';
UPDATE produtos SET nome_retorno = 'Cão Anjo Branco' WHERE nome = 'Cão Anjo Cestinha Branco';
UPDATE produtos SET nome_retorno = 'Gato Anjo Color' WHERE nome = 'Gato Anjo Cestinha Color';
UPDATE produtos SET nome_retorno = 'Gato Anjo Bronze' WHERE nome = 'Gato Anjo Cestinha Bronze';
UPDATE produtos SET nome_retorno = 'Gato Anjo Branco' WHERE nome = 'Gato Anjo Cestinha Branco';
UPDATE produtos SET nome_retorno = 'Cerâmica Preta P' WHERE nome = 'Urna Pote Cerâmica Preta P';
UPDATE produtos SET nome_retorno = 'Cerâmica Verde P' WHERE nome = 'Urna Pote Cerâmica Verde P';
UPDATE produtos SET nome_retorno = 'Cerâmica Branca P' WHERE nome = 'Urna Pote Cerâmica Branca P';
UPDATE produtos SET nome_retorno = 'Cerâmica Azul P' WHERE nome = 'Urna Pote Cerâmica Azul P';
UPDATE produtos SET nome_retorno = 'Cerâmica Azul G Ali' WHERE nome = 'Urna Pote Cerâmica Azul G - Aliexpress';
UPDATE produtos SET nome_retorno = 'Cerâmica Coelho' WHERE nome = 'Urna Pote Cerâmica Coelho';
UPDATE produtos SET nome_retorno = 'Cerâmica Azul G' WHERE nome = 'Urna Pote Cerâmica Azul G';
UPDATE produtos SET nome_retorno = 'Cerâmica Preta G' WHERE nome = 'Urna Pote Cerâmica Preta G';
UPDATE produtos SET nome_retorno = 'Cerâmica Verde G' WHERE nome = 'Urna Pote Cerâmica Verde G';
UPDATE produtos SET nome_retorno = 'Cerâmica Vermelha G' WHERE nome = 'Urna Pote Cerâmica Vermelha G';
UPDATE produtos SET nome_retorno = 'Cão Biossolúvel' WHERE nome = 'Cão na Areia Biossolúvel';
UPDATE produtos SET nome_retorno = 'Gato Biossolúvel' WHERE nome = 'Gato na Areia Biossolúvel';
UPDATE produtos SET nome_retorno = 'Coração Av. Azul' WHERE nome = 'Coraçãozinho Avulso - Azul';
UPDATE produtos SET nome_retorno = 'Coração Av. Branco' WHERE nome = 'Coraçãozinho Avulso - Branco';
UPDATE produtos SET nome_retorno = 'Coração Av. Vermelho' WHERE nome = 'Coraçãozinho Avulso - Vermelho';
UPDATE produtos SET nome_retorno = 'Coração Av. Rosa' WHERE nome = 'Coraçãozinho Avulso - Rosa';

-- Concreto / Pietra - Página 10
UPDATE produtos SET nome_retorno = 'Amigos Concreto' WHERE nome = 'Amigos de Coração com Foto Concreto';
UPDATE produtos SET nome_retorno = 'Amigos Branco' WHERE nome = 'Amigos de Coração com Foto Branco';
UPDATE produtos SET nome_retorno = 'Pietra Plana Branca' WHERE nome = 'Pietra Plana Branca';
UPDATE produtos SET nome_retorno = 'Pietra Plana Concr.' WHERE nome = 'Pietra Plana Concreto';
UPDATE produtos SET nome_retorno = 'Pietra Concreto' WHERE nome = 'Pietra Concreto';
UPDATE produtos SET nome_retorno = 'Pietra Branca' WHERE nome = 'Pietra Branca';
UPDATE produtos SET nome_retorno = 'Pine Azul' WHERE nome = 'Urna Pine Azul';
UPDATE produtos SET nome_retorno = 'Pine Verde' WHERE nome = 'Urna Pine Verde';
UPDATE produtos SET nome_retorno = 'Pine Carmim' WHERE nome = 'Urna Pine Carmim';
UPDATE produtos SET nome_retorno = 'Pine Branca' WHERE nome = 'Urna Pine Branca';

-- PetMemory - Página 11
UPDATE produtos SET nome_retorno = 'PetMem. Gato Preto' WHERE nome = 'Urna PetMemory Gato - Preto';
UPDATE produtos SET nome_retorno = 'PetMem. Gato Ouro F.' WHERE nome = 'Urna PetMemory Gato - Ouro Fosco';
UPDATE produtos SET nome_retorno = 'PetMem. Gato Branco' WHERE nome = 'Urna PetMemory Gato - Branco';
UPDATE produtos SET nome_retorno = 'PetMem. Gato Ouro B.' WHERE nome = 'Urna PetMemory Gato - Ouro Brilho';
UPDATE produtos SET nome_retorno = 'PetMem. Dog Ouro B.' WHERE nome = 'Urna PetMemory Dog - Ouro Brilho';
UPDATE produtos SET nome_retorno = 'PetMem. Dog Branco' WHERE nome = 'Urna PetMemory Dog - Branco';
UPDATE produtos SET nome_retorno = 'PetMem. Dog Preto' WHERE nome = 'Urna PetMemory Dog - Preto';
UPDATE produtos SET nome_retorno = 'PetMem. Dog Ouro F.' WHERE nome = 'Urna PetMemory Dog - Ouro Fosco';

-- Mármore / Inox - Página 12
UPDATE produtos SET nome_retorno = 'Mármore Travertino' WHERE nome = 'Mármore Travertino';
UPDATE produtos SET nome_retorno = 'Mármore Carrara' WHERE nome = 'Mármore Carrara';
UPDATE produtos SET nome_retorno = 'Carrara S. Francisco' WHERE nome = 'Carrara São Francisco';
UPDATE produtos SET nome_retorno = 'Granito Negro' WHERE nome = 'Granito Negro';
UPDATE produtos SET nome_retorno = 'Niquelada Gato' WHERE nome = 'Urna Redonda Niquelada - Gato';
UPDATE produtos SET nome_retorno = 'Niquelada Ossinho' WHERE nome = 'Urna Redonda Niquelada - Ossinho';
UPDATE produtos SET nome_retorno = 'Baú Laca Concreto' WHERE nome = 'Baú Porta Objetos em Laca - Concreto';
UPDATE produtos SET nome_retorno = 'Baú Laca Branca' WHERE nome = 'Baú Porta Objetos em Laca - Branca';
UPDATE produtos SET nome_retorno = 'Inox Bronze Peg.' WHERE nome = 'Urna de Inox Bronze Pegadas';
UPDATE produtos SET nome_retorno = 'Inox Prata Peg.' WHERE nome = 'Urna Inox Prata Pegadas';
UPDATE produtos SET nome_retorno = 'Inox Preta Peg.' WHERE nome = 'Urna de Inox Preta Pegadas';
UPDATE produtos SET nome_retorno = 'Inox Bronze Peq.' WHERE nome = 'Urna de Inox Bronze Pegadas Peq.';
UPDATE produtos SET nome_retorno = 'Inox Preta Peq.' WHERE nome = 'Urna de Inox Preta Pegadas Peq.';
UPDATE produtos SET nome_retorno = 'Inox Prata Peq.' WHERE nome = 'Urna Inox Prata Pegadas Peq.';

-- Petbox - Página 13
UPDATE produtos SET nome_retorno = 'Petbox Branco' WHERE nome = 'Petbox Branco';
UPDATE produtos SET nome_retorno = 'Petbox Marrom' WHERE nome = 'Petbox Marrom';
UPDATE produtos SET nome_retorno = 'Petbox Cru' WHERE nome = 'Petbox Cru';
UPDATE produtos SET nome_retorno = 'Petbox Azul' WHERE nome = 'Petbox Azul';
UPDATE produtos SET nome_retorno = 'Petbox Vermelho' WHERE nome = 'Petbox Vermelho';
UPDATE produtos SET nome_retorno = 'Petbox Menta' WHERE nome = 'Petbox Menta';
UPDATE produtos SET nome_retorno = 'P. Obj. Foto Branco' WHERE nome = 'Porta Objetos e Foto Branco';
UPDATE produtos SET nome_retorno = 'P. Obj. Foto Ouro' WHERE nome = 'Porta Objetos e Foto Ouro Light';

-- Porta-Retrato e Molde - Página 14
UPDATE produtos SET nome_retorno = 'P-R Molde Trip. Cast.' WHERE nome = 'Porta-Retrato e Molde da Patinha Triplo Castanho';
UPDATE produtos SET nome_retorno = 'P-R Molde Trip. Marf.' WHERE nome = 'Porta-Retrato e Molde da Patinha Triplo Marfim';
UPDATE produtos SET nome_retorno = 'P-R Molde Trip. Bco.' WHERE nome = 'Porta-Retrato e Molde da Patinha Triplo Branco';
UPDATE produtos SET nome_retorno = 'P-R Molde Dup. Bco.' WHERE nome = 'Porta-Retrato e Molde da Patinha Duplo Branco';
UPDATE produtos SET nome_retorno = 'P-R Molde Dup. Marf.' WHERE nome = 'Porta-Retrato e Molde da Patinha Duplo Marfim';
UPDATE produtos SET nome_retorno = 'P-R Molde Dup. Cast.' WHERE nome = 'Porta-Retrato e Molde da Patinha Duplo Castanho';
UPDATE produtos SET nome_retorno = 'P-R Molde Dup. Preto' WHERE nome = 'Porta-Retrato e Molde da Patinha Duplo Preto';
UPDATE produtos SET nome_retorno = 'Carimbo Patinha' WHERE nome = 'Carimbo Patinha em Papel';
UPDATE produtos SET nome_retorno = 'P-R Molde Trip. Preto' WHERE nome = 'Porta-Retrato e Molde da Patinha Triplo Preto';
UPDATE produtos SET nome_retorno = 'P-R Molde Patas Bco.' WHERE nome = 'Porta-Retrato e Molde Patas Branco';
UPDATE produtos SET nome_retorno = 'P-R Molde Patas Preto' WHERE nome = 'Porta-Retrato e Molde Patas Preto';

-- Plaquinha / Miniaturas - Páginas 15-16
UPDATE produtos SET nome_retorno = 'Plaquinha' WHERE nome = 'Plaquinha';
UPDATE produtos SET nome_retorno = 'Miniatura' WHERE nome = 'Miniaturas';

-- Miniaturas individuais
UPDATE produtos SET nome_retorno = 'Mini. Basset Dou.' WHERE nome = 'Miniatura - Basset DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Basset Bco.' WHERE nome = 'Miniatura - Basset BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Beagle Dou.' WHERE nome = 'Miniatura - Beagle DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Beagle Bco.' WHERE nome = 'Miniatura - Beagle BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Blue Heeler Dou.' WHERE nome = 'Miniatura - Blue  Heeler DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Blue Heeler Bco.' WHERE nome = 'Miniatura - Blue  Heeler BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Border Dou.' WHERE nome = 'Miniatura - Border Collie DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Border Bco.' WHERE nome = 'Miniatura - Border Collie BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Boxer Dou.' WHERE nome = 'Miniatura - Boxer DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Boxer Bco.' WHERE nome = 'Miniatura - Boxer BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Bulldog Dou.' WHERE nome = 'Miniatura - Bulldog DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Bulldog Bco.' WHERE nome = 'Miniatura - Bulldog BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. B. Francês Dou.' WHERE nome = 'Miniatura - Bulldog Francês DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. B. Francês Bco.' WHERE nome = 'Miniatura - Bulldog Francês BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. B. Inglês Dou.' WHERE nome = 'Miniatura - Bulldog Inglês DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. B. Inglês Bco.' WHERE nome = 'Miniatura - Bulldog Inglês BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Bullterrier Dou.' WHERE nome = 'Miniatura - Bullterrier DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Bullterrier Bco.' WHERE nome = 'Miniatura - Bullterrier BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Chihuahua Dou.' WHERE nome = 'Miniatura - Chihuahua DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Chihuahua Bco.' WHERE nome = 'Miniatura - Chihuahua BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Chow Chow Dou.' WHERE nome = 'Miniatura - Chow Chow DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Chow Chow Bco.' WHERE nome = 'Miniatura - Chow Chow BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Cocker Dou.' WHERE nome = 'Miniatura - Cocker DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Cocker Bco.' WHERE nome = 'Miniatura - Cocker BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Daschund Dou.' WHERE nome = 'Miniatura - Daschund DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Daschund Bco.' WHERE nome = 'Miniatura - Daschund BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Doberman Dou.' WHERE nome = 'Miniatura - Doberman DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Doberman Bco.' WHERE nome = 'Miniatura - Doberman BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Galgo Dou.' WHERE nome = 'Miniatura - Galgo DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Galgo Bco.' WHERE nome = 'Miniatura - Galgo BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Golden Dou.' WHERE nome = 'Miniatura - Golden DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Golden Bco.' WHERE nome = 'Miniatura - Golden BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Husky Dou.' WHERE nome = 'Miniatura - Husky Siberiano DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Husky Bco.' WHERE nome = 'Miniatura - Husky Siberiano BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Labrador Dou.' WHERE nome = 'Miniatura - Labrador DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Labrador Bco.' WHERE nome = 'Miniatura - Labrador BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Lulu Dou.' WHERE nome = 'Miniatura - Lulu da Pomerania DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Lulu Bco.' WHERE nome = 'Miniatura - Lulu da Pomerania BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Maltês Dou.' WHERE nome = 'Miniatura - Maltês DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Maltês Bco.' WHERE nome = 'Miniatura - Maltês BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Pastor Dou.' WHERE nome = 'Miniatura - Pastor Alemão DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Pastor Bco.' WHERE nome = 'Miniatura - Pastor Alemão BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Pequinês Dou.' WHERE nome = 'Miniatura - Pequinês DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Pequinês Bco.' WHERE nome = 'Miniatura - Pequinês BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Pinscher Dou.' WHERE nome = 'Miniatura - Pinscher DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Pinscher Bco.' WHERE nome = 'Miniatura - Pinscher BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Pitbull Dou.' WHERE nome = 'Miniatura - Pitbull DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Pitbull Bco.' WHERE nome = 'Miniatura - Pitbull BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Poodle Dou.' WHERE nome = 'Miniatura - Poodle DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Poodle Bco.' WHERE nome = 'Miniatura - Poodle BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Pug Dou.' WHERE nome = 'Miniatura - Pug DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Pug Bco.' WHERE nome = 'Miniatura - Pug BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Rottweiller Dou.' WHERE nome = 'Miniatura - Rottweiller DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Rottweiller Bco.' WHERE nome = 'Miniatura - Rottweiller BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. S.Bernardo G Dou.' WHERE nome = 'Miniatura - São Bernardo G DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. S.Bernardo G Bco.' WHERE nome = 'Miniatura - São Bernardo G BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. S.Bernardo P Dou.' WHERE nome = 'Miniatura - São Bernardo P DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. S.Bernardo P Bco.' WHERE nome = 'Miniatura - São Bernardo P BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Schnauzer Dou.' WHERE nome = 'Miniatura - Schnauzer DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Schnauzer Bco.' WHERE nome = 'Miniatura - Schnauzer BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Shiba Dou.' WHERE nome = 'Miniatura - Shiba DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Shiba Bco.' WHERE nome = 'Miniatura - Shiba BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Shihtzu Dou.' WHERE nome = 'Miniatura - Shihtzu DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Shihtzu Bco.' WHERE nome = 'Miniatura - Shihtzu BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. SRD Dou.' WHERE nome = 'Miniatura - SRD DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. SRD Bco.' WHERE nome = 'Miniatura - SRD BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Spitz Dou.' WHERE nome = 'Miniatura - Spitz DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Spitz Bco.' WHERE nome = 'Miniatura - Spitz BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. York c/laço Dou.' WHERE nome = 'Miniatura - Yorkshire (com laço) DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. York c/laço Bco.' WHERE nome = 'Miniatura - Yorkshire (com laço) BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. York s/laço Dou.' WHERE nome = 'Miniatura - Yorkshire (sem laço) DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. York s/laço Bco.' WHERE nome = 'Miniatura - Yorkshire (sem laço) BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. West High. Dou.' WHERE nome = 'Miniatura - West Highland DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. West High. Bco.' WHERE nome = 'Miniatura - West Highland BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Gato SRD Dou.' WHERE nome = 'Miniatura - Gato SRD DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Gato SRD Bco.' WHERE nome = 'Miniatura - Gato SRD BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Gato Persa Dou.' WHERE nome = 'Miniatura - Gato Persa DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Gato Persa Bco.' WHERE nome = 'Miniatura - Gato Persa BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Calopsita Dou.' WHERE nome = 'Miniatura - Calopsita DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Calopsita Bco.' WHERE nome = 'Miniatura - Calopsita BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Coelho Dou.' WHERE nome = 'Miniatura - Coelho DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Coelho Bco.' WHERE nome = 'Miniatura - Coelho BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Furão Dou.' WHERE nome = 'Miniatura - Furão DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Furão Bco.' WHERE nome = 'Miniatura - Furão BRANCO';
UPDATE produtos SET nome_retorno = 'Mini. Porquinho Dou.' WHERE nome = 'Miniatura - Porquinho da Índia DOURADO';
UPDATE produtos SET nome_retorno = 'Mini. Porquinho Bco.' WHERE nome = 'Miniatura - Porquinho da Índia BRANCO';

-- Pingentes Porta-Cinzas - Página 17
UPDATE produtos SET nome_retorno = 'Ping. Palito Prata' WHERE nome = 'Pingente Palito Porta Cinzas - Prata';
UPDATE produtos SET nome_retorno = 'Ping. Palito Dourado' WHERE nome = 'Pingente Palito Porta Cinzas - Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Palito Preto' WHERE nome = 'Pingente Palito Porta Cinzas - Preto';
UPDATE produtos SET nome_retorno = 'Ping. Infinito' WHERE nome = 'Pingente Infinito Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Gatinho' WHERE nome = 'Pingente Gatinho Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Coração Cinzas' WHERE nome = 'Pingente Coração Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Peg. Prata' WHERE nome = 'Pingente Coração com Pegadas - Prata';
UPDATE produtos SET nome_retorno = 'Ping. Peg. Dourado' WHERE nome = 'Pingente Coração com Pegadas - Dourado';
UPDATE produtos SET nome_retorno = 'Chav. Visor Prata' WHERE nome = 'Chaveiro com Visor Porta-Cinzas - Prata';
UPDATE produtos SET nome_retorno = 'Chav. Visor Dourado' WHERE nome = 'Chaveiro com Visor Porta-Cinzas - Dourado';

-- Pingentes - Página 18
UPDATE produtos SET nome_retorno = 'Ping. Cor. Visor' WHERE nome = 'Pingente Coração c/ Visor Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Cor. Prata' WHERE nome = 'Pingente Coração Prata - Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Árvore 2' WHERE nome = 'Pingente Árvore da Vida 2 - Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Árvore' WHERE nome = 'Pingente Árvore da Vida - Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Preto' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Preto';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Prata' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Prata';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Verde' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Verde';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Roxo' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Roxo';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Vermelho' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Vermelho';
UPDATE produtos SET nome_retorno = 'Cáps. Chav. Azul' WHERE nome = 'Cápsula Chaveiro Para Cinzas - Azul';

-- Pingentes - Página 19
UPDATE produtos SET nome_retorno = 'Ping. Cor. Gatinho' WHERE nome = 'Pingente Coração c/ Gatinho Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Cor. Peg. Prata' WHERE nome = 'Pingente Coração c/ Pegadas Porta Cinzas - Prata';
UPDATE produtos SET nome_retorno = 'Ping. Relicário' WHERE nome = 'Pingente Relicário Vidro Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Cor. Vidro' WHERE nome = 'Pingente Coração de Vidro Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Together' WHERE nome = 'Pingente Together Forever - Porta Cinzas';

-- Pingentes / Porta-Pelo - Página 20
UPDATE produtos SET nome_retorno = 'Ping. Bola Árvore' WHERE nome = 'Pingente Bola Árvore - Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Gota Cravejada' WHERE nome = 'Pingente Gota Prata Cravejada - Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Prata' WHERE nome = 'Pingente c/ Visor Porta Pelo - Prata';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Prata BG' WHERE nome = 'Pingente c/ Visor Porta Pelo - Prata BORDA GROSSA';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Prata BF' WHERE nome = 'Pingente c/ Visor Porta Pelo - Prata borda fina';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Prata' WHERE nome = '[ALTER] Pingente c/ Visor Porta Pelo - Prata';
UPDATE produtos SET nome_retorno = 'Patinha Visor Prata' WHERE nome = 'Patinha p/ Visor Porta Pelo - Prata';
UPDATE produtos SET nome_retorno = 'Cach. Visor Prata' WHERE nome = 'Cachorrinho p/ Visor Porta Pelo - Prata';
UPDATE produtos SET nome_retorno = 'Gat. Visor Prata' WHERE nome = 'Gatinho p/ Visor Porta Pelo - Prata';
UPDATE produtos SET nome_retorno = 'Cach. Visor Dourado' WHERE nome = 'Cachorrinho p/ Visor Porta Pelo - Dourado';
UPDATE produtos SET nome_retorno = 'Gat. Visor Dourado' WHERE nome = 'Gatinho p/ Visor Porta Pelo - Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Dourado' WHERE nome = '[LEGA] Pingente c/ Visor Porta Pelo - Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Dourado' WHERE nome = 'Pingente c/ Visor Porta Pelo - Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Dou. BG' WHERE nome = 'Pingente c/ Visor Porta Pelo - Dourado BORDA GROSSA';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Dou. BF' WHERE nome = 'Pingente c/ Visor Porta Pelo - Dourado borda fina';
UPDATE produtos SET nome_retorno = 'Ping. Visor Pelo Dourado' WHERE nome = '[ALTER] Pingente c/ Visor Porta Pelo - Dourado';
UPDATE produtos SET nome_retorno = 'Patinha Visor Dourada' WHERE nome = 'Patinha p/ Visor Porta Pelo - Dourada';
UPDATE produtos SET nome_retorno = 'Ping. Cor. Pelo Prata' WHERE nome = 'Pingente Coração Porta Pelo Prata';
UPDATE produtos SET nome_retorno = 'Ping. Cor. Pelo Dourado' WHERE nome = 'Pingente Coração Porta Pelo Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Flor de Lótus' WHERE nome = 'Pingente Flor de Lótus Porta Cinzas';
UPDATE produtos SET nome_retorno = 'Ping. Visor Strass Dou.' WHERE nome = 'Pingente Visor Strass Porta-Pelo Dourado';
UPDATE produtos SET nome_retorno = 'Ping. Visor Strass Prata' WHERE nome = 'Pingente Visor Strass Porta-Pelo Prata';

-- Especiais
UPDATE produtos SET nome_retorno = 'Diamante 0,1ct' WHERE nome = 'Diamante 0,1ct Branco - Vanessa Espinoza';
UPDATE produtos SET nome_retorno = 'Foto p/ Pingente' WHERE nome = 'Foto Dentro do Pingente Visor';
