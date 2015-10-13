-- phpMyAdmin SQL Dump
-- version 4.4.12
-- http://www.phpmyadmin.net
--
-- Host: 127.0.0.1
-- Generation Time: Oct 13, 2015 at 04:28 PM
-- Server version: 5.6.25
-- PHP Version: 5.6.11

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `petteramu_com`
--

-- --------------------------------------------------------

--
-- Table structure for table `champion`
--

CREATE TABLE IF NOT EXISTS `champion` (
  `championId` smallint(6) NOT NULL,
  `name` varchar(32) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `game`
--

CREATE TABLE IF NOT EXISTS `game` (
  `gameId` bigint(20) unsigned NOT NULL,
  `mapId` tinyint(3) unsigned NOT NULL,
  `gameCreation` int(11) NOT NULL,
  `gameMode` varchar(32) NOT NULL,
  `gameType` varchar(32) NOT NULL,
  `gameVersion` varchar(32) NOT NULL,
  `gameDuration` mediumint(8) unsigned NOT NULL,
  `queueType` varchar(128) NOT NULL,
  `platformId` varchar(32) NOT NULL,
  `region` varchar(32) NOT NULL,
  `season` varchar(10) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `item`
--

CREATE TABLE IF NOT EXISTS `item` (
  `itemId` smallint(6) NOT NULL,
  `name` varchar(32) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `participant`
--

CREATE TABLE IF NOT EXISTS `participant` (
  `gameId` bigint(20) unsigned NOT NULL,
  `summonerId` bigint(20) unsigned NOT NULL,
  `teamId` tinyint(3) unsigned DEFAULT NULL,
  `championId` smallint(5) unsigned DEFAULT NULL,
  `kills` smallint(5) unsigned DEFAULT NULL,
  `deaths` smallint(5) unsigned DEFAULT NULL,
  `assists` smallint(5) unsigned DEFAULT NULL,
  `winner` tinyint(1) DEFAULT NULL,
  `spell1Id` tinyint(3) unsigned DEFAULT NULL,
  `spell2Id` tinyint(3) unsigned DEFAULT NULL,
  `lane` set('MID','JUNGLE','BOT','TOP') DEFAULT NULL,
  `role` set('DUO','DUO_CARRY','DUO_SUPPORT','NONE','SOLO') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `participant_stats`
--

CREATE TABLE IF NOT EXISTS `participant_stats` (
  `gameId` bigint(20) unsigned NOT NULL,
  `summonerId` bigint(20) unsigned NOT NULL,
  `champLevel` tinyint(3) unsigned NOT NULL,
  `doubleKills` tinyint(3) unsigned NOT NULL,
  `tripleKills` tinyint(3) unsigned NOT NULL,
  `quadraKills` tinyint(3) unsigned NOT NULL,
  `pentaKills` tinyint(3) unsigned NOT NULL,
  `unrealKills` tinyint(3) unsigned NOT NULL,
  `killingSprees` tinyint(3) unsigned NOT NULL,
  `largestKillingSpree` tinyint(3) unsigned NOT NULL,
  `largestCriticalStrike` mediumint(8) unsigned NOT NULL,
  `totalDamageDealt` mediumint(8) unsigned NOT NULL,
  `totalDamageDealtToChampions` mediumint(8) unsigned NOT NULL,
  `totalDamageTaken` mediumint(8) unsigned NOT NULL,
  `physicalDamageDealt` mediumint(8) unsigned NOT NULL,
  `physicalDamageDealtToChampions` mediumint(8) unsigned NOT NULL,
  `physicalDamageTaken` mediumint(8) unsigned NOT NULL,
  `magicDamageDealt` mediumint(8) unsigned NOT NULL,
  `magicDamageDealtToChampions` mediumint(8) unsigned NOT NULL,
  `magicDamageTaken` mediumint(8) unsigned NOT NULL,
  `trueDamageDealt` mediumint(8) unsigned NOT NULL,
  `trueDamageDealtToChampions` mediumint(8) unsigned NOT NULL,
  `trueDamageDealtTaken` mediumint(8) unsigned NOT NULL,
  `totalHeal` smallint(5) unsigned NOT NULL,
  `sightWardsBought` smallint(5) unsigned NOT NULL,
  `visionWardsBought` smallint(5) unsigned NOT NULL,
  `wardsPlaced` smallint(5) unsigned NOT NULL,
  `wardsKilled` smallint(5) unsigned NOT NULL,
  `item0` smallint(5) unsigned NOT NULL,
  `item1` smallint(5) unsigned NOT NULL,
  `item2` smallint(5) unsigned NOT NULL,
  `item3` smallint(5) unsigned NOT NULL,
  `item4` smallint(5) unsigned NOT NULL,
  `item5` smallint(5) unsigned NOT NULL,
  `item6` smallint(5) unsigned NOT NULL,
  `minionsKilled` smallint(5) unsigned NOT NULL,
  `firstBloodAssist` tinyint(1) NOT NULL,
  `firstBloodKill` tinyint(1) NOT NULL,
  `firstTowerAssist` tinyint(1) NOT NULL,
  `firstTowerKill` tinyint(1) NOT NULL,
  `firstInhibitorAssist` tinyint(1) NOT NULL,
  `firstInhibitorKill` tinyint(1) NOT NULL,
  `goldEarned` mediumint(8) unsigned NOT NULL,
  `goldSpent` mediumint(8) unsigned NOT NULL,
  `totalTimeCrowdControlDealt` smallint(5) unsigned NOT NULL,
  `totalUnitsHealed` smallint(5) unsigned NOT NULL,
  `neutralMinionsKilled` smallint(5) unsigned NOT NULL,
  `neutralMinionsKilledEnemyJungle` smallint(5) unsigned NOT NULL,
  `neutralMinionsKilledTeamJungle` smallint(5) unsigned NOT NULL,
  `towerKills` tinyint(3) unsigned NOT NULL,
  `inhibitorKills` tinyint(3) unsigned NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `summoner`
--

CREATE TABLE IF NOT EXISTS `summoner` (
  `summonerId` bigint(20) unsigned NOT NULL,
  `name` varchar(16) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `summoner_champ_stats`
--

CREATE TABLE IF NOT EXISTS `summoner_champ_stats` (
  `summonerId` bigint(20) NOT NULL,
  `championId` smallint(6) NOT NULL,
  `wins` mediumint(9) NOT NULL,
  `losses` mediumint(9) NOT NULL,
  `kills` mediumint(9) NOT NULL,
  `deaths` mediumint(9) NOT NULL,
  `assists` mediumint(9) NOT NULL,
  `lastUpdated` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `summoner_games_update`
--

CREATE TABLE IF NOT EXISTS `summoner_games_update` (
  `summonerId` bigint(20) NOT NULL,
  `lastUpdate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `summoner_league`
--

CREATE TABLE IF NOT EXISTS `summoner_league` (
  `summonerId` bigint(20) unsigned NOT NULL,
  `queueType` varchar(32) NOT NULL,
  `league` varchar(12) NOT NULL,
  `division` varchar(3) NOT NULL,
  `points` tinyint(3) NOT NULL,
  `wins` smallint(5) unsigned NOT NULL,
  `losses` smallint(5) unsigned NOT NULL,
  `lastUpdated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `team`
--

CREATE TABLE IF NOT EXISTS `team` (
  `teamId` smallint(3) NOT NULL,
  `gameId` bigint(20) NOT NULL,
  `winner` tinyint(1) NOT NULL,
  `baronKills` tinyint(3) unsigned NOT NULL,
  `dragonKills` tinyint(3) unsigned NOT NULL,
  `towerKills` tinyint(3) unsigned NOT NULL,
  `firstBaron` tinyint(1) NOT NULL,
  `firstDragon` tinyint(1) NOT NULL,
  `firstTower` tinyint(1) NOT NULL,
  `firstInhibitor` tinyint(1) NOT NULL,
  `firstBlood` tinyint(1) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `champion`
--
ALTER TABLE `champion`
  ADD PRIMARY KEY (`championId`);

--
-- Indexes for table `game`
--
ALTER TABLE `game`
  ADD PRIMARY KEY (`gameId`);

--
-- Indexes for table `item`
--
ALTER TABLE `item`
  ADD PRIMARY KEY (`itemId`);

--
-- Indexes for table `participant`
--
ALTER TABLE `participant`
  ADD PRIMARY KEY (`gameId`,`summonerId`);

--
-- Indexes for table `participant_stats`
--
ALTER TABLE `participant_stats`
  ADD PRIMARY KEY (`gameId`,`summonerId`),
  ADD UNIQUE KEY `gameId` (`gameId`),
  ADD UNIQUE KEY `gameId_2` (`gameId`,`summonerId`);

--
-- Indexes for table `summoner`
--
ALTER TABLE `summoner`
  ADD PRIMARY KEY (`summonerId`);

--
-- Indexes for table `summoner_champ_stats`
--
ALTER TABLE `summoner_champ_stats`
  ADD PRIMARY KEY (`summonerId`,`championId`);

--
-- Indexes for table `summoner_games_update`
--
ALTER TABLE `summoner_games_update`
  ADD PRIMARY KEY (`summonerId`);

--
-- Indexes for table `summoner_league`
--
ALTER TABLE `summoner_league`
  ADD PRIMARY KEY (`summonerId`,`queueType`);

--
-- Indexes for table `team`
--
ALTER TABLE `team`
  ADD PRIMARY KEY (`teamId`,`gameId`);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
